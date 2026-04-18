#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { CloudSnipStack } from '../lib/cloudsnip-stack';

const app = new cdk.App();

new CloudSnipStack(app, 'CloudSnipStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
  },
  description: 'CloudSnip — Serverless URL Shortener & Analytics Platform',
});

app.synth();
