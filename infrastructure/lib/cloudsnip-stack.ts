import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import * as path from 'path';

/*
  CloudSnipStack - defines all the AWS infrastructure for this project

  This is the "infrastructure as code" part. Instead of clicking around in the
  AWS console and manually creating things, I define everything here and CDK
  handles creating/updating it all automatically when I run `cdk deploy`.

  Resources created by this stack:
  - DynamoDB table (stores the short codes)
  - 4 Lambda functions (shorten, redirect, analytics, list_urls)
  - API Gateway (the HTTP API that triggers the lambdas)
  - S3 bucket (hosts the React frontend)
  - CloudFront distribution (CDN in front of S3 and API Gateway)
*/

export class CloudSnipStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ---------------------------------------------------------------
    // DynamoDB Table
    // ---------------------------------------------------------------
    // This stores all the short URLs.
    // Schema: shortCode (PK) -> originalUrl, clickCount, createdAt, etc.
    //
    // I'm using PAY_PER_REQUEST billing so I don't pay for capacity I'm not using.
    // On-demand pricing is great for a personal project with unpredictable traffic.
    //
    // timeToLiveAttribute lets DynamoDB automatically delete expired items
    // (links with past expiresAt timestamps get deleted for free)
    const urlsTable = new dynamodb.Table(this, 'UrlsTable', {
      tableName: 'cloudsnip-urls',
      partitionKey: {
        name: 'shortCode',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'expiresAt',
      removalPolicy: cdk.RemovalPolicy.RETAIN, // don't delete data if stack is destroyed
      pointInTimeRecovery: true,               // can restore to any point in last 35 days
    });

    // GSI (Global Secondary Index) for listing all URLs by creation date
    // Every item has pk="URL" so I can query this index to get all items sorted by createdAt.
    // Without this I'd have to do a Scan which reads the whole table - not efficient.
    urlsTable.addGlobalSecondaryIndex({
      indexName: 'createdAt-index',
      partitionKey: {
        name: 'pk',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'createdAt',
        type: dynamodb.AttributeType.STRING,
      },
    });

    // ---------------------------------------------------------------
    // Lambda Layer (shared code)
    // ---------------------------------------------------------------
    // A Lambda Layer is a way to share code between multiple Lambda functions.
    // I'm bundling the shared/utils.py + pip packages into a layer so all 4
    // functions can use them without duplicating code.
    //
    // The bundling config runs pip install inside a Docker container that matches
    // the Lambda runtime - this way packages are compiled for the right OS.
    const sharedLayer = new lambda.LayerVersion(this, 'SharedLayer', {
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend'), {
        bundling: {
          image: lambda.Runtime.PYTHON_3_11.bundlingImage,
          command: [
            'bash', '-c',
            'pip install -r requirements.txt -t /asset-output/python && cp -r shared /asset-output/python/',
          ],
        },
      }),
      compatibleRuntimes: [lambda.Runtime.PYTHON_3_11],
      description: 'Shared utilities and pip packages for CloudSnip',
    });

    // ---------------------------------------------------------------
    // Lambda Functions
    // ---------------------------------------------------------------
    // Common settings shared across all 4 functions
    // Putting this in a variable so I don't repeat myself
    const commonProps = {
      runtime: lambda.Runtime.PYTHON_3_11,
      layers: [sharedLayer],
      environment: {
        TABLE_NAME: urlsTable.tableName,
        LOG_LEVEL: 'INFO',
      },
      timeout: cdk.Duration.seconds(10),  // max execution time
      memorySize: 256,                    // MB - 256 is plenty for simple DB lookups
      tracing: lambda.Tracing.ACTIVE,     // X-Ray tracing for debugging
    };

    // POST /shorten - creates a new short URL
    const shortenFn = new lambda.Function(this, 'ShortenFunction', {
      ...commonProps,
      functionName: 'cloudsnip-shorten',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/functions/shorten')),
      handler: 'handler.lambda_handler',
      description: 'Creates a shortened URL and saves it to DynamoDB',
    });

    // GET /{shortCode} - looks up and redirects to original URL
    const redirectFn = new lambda.Function(this, 'RedirectFunction', {
      ...commonProps,
      functionName: 'cloudsnip-redirect',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/functions/redirect')),
      handler: 'handler.lambda_handler',
      description: 'Redirects short code to original URL and records click',
    });

    // GET /analytics/{shortCode} - returns stats for a link
    const analyticsFn = new lambda.Function(this, 'AnalyticsFunction', {
      ...commonProps,
      functionName: 'cloudsnip-analytics',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/functions/analytics')),
      handler: 'handler.lambda_handler',
      description: 'Returns click analytics for a short URL',
    });

    // GET /urls - lists all links (for the dashboard)
    const listUrlsFn = new lambda.Function(this, 'ListUrlsFunction', {
      ...commonProps,
      functionName: 'cloudsnip-list-urls',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/functions/list_urls')),
      handler: 'handler.lambda_handler',
      description: 'Lists all short URLs for the dashboard',
    });

    // Grant each function only the DynamoDB permissions it actually needs
    // (principle of least privilege - don't give more access than necessary)
    urlsTable.grantWriteData(shortenFn);      // shorten needs to write new items
    urlsTable.grantReadWriteData(redirectFn); // redirect needs read (lookup) + write (click count)
    urlsTable.grantReadData(analyticsFn);     // analytics only reads
    urlsTable.grantReadData(listUrlsFn);      // list only reads

    // ---------------------------------------------------------------
    // API Gateway
    // ---------------------------------------------------------------
    // This is the HTTP API that sits in front of the Lambda functions.
    // Handles routing, CORS, throttling, etc.
    const api = new apigateway.RestApi(this, 'CloudSnipApi', {
      restApiName: 'CloudSnip API',
      description: 'REST API for CloudSnip URL shortener',
      deployOptions: {
        stageName: 'prod',
        tracingEnabled: true,
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        // throttling - limit requests to prevent abuse
        // TODO: might want to add per-IP rate limiting later
        throttlingRateLimit: 1000,
        throttlingBurstLimit: 500,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'Authorization'],
      },
    });

    // POST /shorten
    const shortenResource = api.root.addResource('shorten');
    shortenResource.addMethod('POST', new apigateway.LambdaIntegration(shortenFn));

    // GET /urls
    const urlsResource = api.root.addResource('urls');
    urlsResource.addMethod('GET', new apigateway.LambdaIntegration(listUrlsFn));

    // GET /analytics/{shortCode}
    const analyticsResource = api.root.addResource('analytics');
    const analyticsCode = analyticsResource.addResource('{shortCode}');
    analyticsCode.addMethod('GET', new apigateway.LambdaIntegration(analyticsFn));

    // GET /{shortCode} - this MUST be last because it's a catch-all
    const shortCodeResource = api.root.addResource('{shortCode}');
    shortCodeResource.addMethod('GET', new apigateway.LambdaIntegration(redirectFn));

    // ---------------------------------------------------------------
    // S3 Bucket (frontend hosting)
    // ---------------------------------------------------------------
    // Stores the built React app files (HTML, JS, CSS)
    // Block all public access - CloudFront will serve the files, not S3 directly
    const frontendBucket = new s3.Bucket(this, 'FrontendBucket', {
      bucketName: `cloudsnip-frontend-${this.account}-${this.region}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // ---------------------------------------------------------------
    // CloudFront Distribution
    // ---------------------------------------------------------------
    // CloudFront is a CDN - it caches and serves the frontend from edge locations
    // close to users around the world, making it load faster.
    //
    // I'm also routing /api/* requests through CloudFront to the API Gateway.
    // This way the frontend only needs one domain for both the app and the API.
    const oac = new cloudfront.S3OriginAccessControl(this, 'FrontendOAC', {
      description: 'Allows CloudFront to access the S3 frontend bucket',
    });

    const distribution = new cloudfront.Distribution(this, 'FrontendDistribution', {
      defaultBehavior: {
        // serve the React app from S3
        origin: origins.S3BucketOrigin.withOriginAccessControl(frontendBucket, {
          originAccessControl: oac,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        compress: true,
      },
      additionalBehaviors: {
        // route API calls to API Gateway
        '/api/*': {
          origin: new origins.HttpOrigin(
            `${api.restApiId}.execute-api.${this.region}.amazonaws.com`,
            { originPath: '/prod' }
          ),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED, // don't cache API responses
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        },
      },
      defaultRootObject: 'index.html',
      // redirect all 404s to index.html so React Router handles routing
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
        },
      ],
      comment: 'CloudSnip frontend CDN',
    });

    // Allow CloudFront to read files from S3
    frontendBucket.addToResourcePolicy(new iam.PolicyStatement({
      actions: ['s3:GetObject'],
      resources: [frontendBucket.arnForObjects('*')],
      principals: [new iam.ServicePrincipal('cloudfront.amazonaws.com')],
      conditions: {
        StringEquals: {
          'AWS:SourceArn': `arn:aws:cloudfront::${this.account}:distribution/${distribution.distributionId}`,
        },
      },
    }));

    // ---------------------------------------------------------------
    // Outputs
    // ---------------------------------------------------------------
    // These get printed after `cdk deploy` - save these!
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: api.url,
      description: 'API Gateway URL - use this as VITE_API_URL when running frontend locally',
    });

    new cdk.CfnOutput(this, 'CloudFrontUrl', {
      value: `https://${distribution.distributionDomainName}`,
      description: 'Your app URL - this is the public URL of the frontend',
    });

    new cdk.CfnOutput(this, 'DynamoTableName', {
      value: urlsTable.tableName,
      description: 'DynamoDB table name',
    });
  }
}
