# CloudSnip - URL Shortener built on AWS

Hey! This is a personal project I built to learn AWS and serverless architecture. It's basically a URL shortener (like bit.ly) but fully deployed on AWS using serverless services — no EC2, no servers to manage.

I built this while learning AWS CDK and it took me a while to get everything connected properly, but I'm pretty happy with how it turned out 

**Live demo:** (coming soon — need to set up a custom domain)

---

## What it does

- Paste a long URL → get a short link back
- Custom aliases supported (e.g. `/my-link` instead of a random code)
- Tracks how many times each link was clicked
- Dashboard to see all your links and their stats
- Links auto-expire after a set number of days

---

## Tech Stack

I tried to use as many AWS services as I could to learn them:

| What | Technology |
|------|------------|
| Infrastructure (IaC) | AWS CDK v2 (TypeScript) |
| Backend | AWS Lambda (Python 3.11) |
| API | Amazon API Gateway |
| Database | Amazon DynamoDB |
| Frontend | React + TypeScript (Vite) |
| Hosting | S3 + CloudFront |
| CI/CD | GitHub Actions |

---

## Architecture

This is roughly how everything connects:

```
User
 │
 ├─── visits frontend ──► CloudFront ──► S3 (React app)
 │
 └─── makes API call ──► API Gateway ──► Lambda functions ──► DynamoDB
```

I went serverless because:
1. Free tier covers basically everything at my usage level
2. No servers to manage or worry about
3. I wanted to actually learn Lambda + DynamoDB

---

## Project Structure

```
cloudsnip/
├── infrastructure/        # CDK stack - defines all AWS resources
│   ├── bin/
│   │   └── cloudsnip.ts   # entry point
│   └── lib/
│       └── cloudsnip-stack.ts  # all the AWS stuff lives here
│
├── backend/               # Lambda functions (Python)
│   ├── functions/
│   │   ├── shorten/       # handles POST /shorten
│   │   ├── redirect/      # handles GET /{code} - does the actual redirect
│   │   ├── analytics/     # handles GET /analytics/{code}
│   │   └── list_urls/     # handles GET /urls (for the dashboard)
│   ├── shared/
│   │   └── utils.py       # helper functions shared between lambdas
│   └── tests/             # pytest tests
│
└── frontend/              # React app
    └── src/
        ├── components/    # UI components
        ├── api/           # API calls
        └── types/         # TypeScript types
```

---

## How to run this yourself

### Prerequisites
- AWS account + AWS CLI configured (`aws configure`)
- Node.js 18+
- Python 3.11+
- AWS CDK: `npm install -g aws-cdk`

### Deploy to AWS

```bash
# clone it
git clone https://github.com/YOUR_USERNAME/cloudsnip.git
cd cloudsnip

# install CDK dependencies
cd infrastructure
npm install

# first time only - sets up CDK in your account
cdk bootstrap

# deploy everything
cdk deploy
```

After running `cdk deploy` it will print out the API URL and the CloudFront URL. Copy those.

### Run the frontend locally

```bash
cd frontend
npm install

# put your API gateway URL here
echo "VITE_API_URL=https://YOUR_API_ID.execute-api.us-east-1.amazonaws.com/prod" > .env.local

npm run dev
# opens at http://localhost:3000
```

### Run backend tests

```bash
cd backend
pip install -r requirements.txt
pytest tests/ -v
```

---

## API Endpoints

### POST /shorten
Creates a short URL.

```json
// request
{
  "url": "https://example.com/some/long/url",
  "customAlias": "my-link",   // optional
  "ttlDays": 30               // optional, how many days before it expires
}

// response (201)
{
  "shortCode": "my-link",
  "shortUrl": "https://xxxx.cloudfront.net/my-link",
  "originalUrl": "https://example.com/some/long/url",
  "createdAt": "2024-01-15T10:30:00Z"
}
```

### GET /{shortCode}
Redirects to the original URL. Also increments the click counter.

### GET /analytics/{shortCode}
Returns stats for a short link.

```json
{
  "shortCode": "my-link",
  "originalUrl": "https://example.com/...",
  "clickCount": 42,
  "createdAt": "2024-01-15T10:30:00Z",
  "lastClickedAt": "2024-01-20T08:15:00Z"
}
```

### GET /urls
Lists all your short links (used by the dashboard).

---

## Things I learned building this

- **CDK is really powerful** - writing infrastructure as code in TypeScript and just running `cdk deploy` to spin up 6+ AWS services is honestly mind blowing
- **DynamoDB is different** - coming from SQL, DynamoDB took some getting used to. No JOINs, and you really need to think about access patterns upfront. I added a GSI (Global Secondary Index) to support the dashboard query
- **Lambda cold starts** - first request after the function hasn't been called in a while is slightly slower. Not a big deal for this project but something to keep in mind
- **CORS** - spent like an hour debugging CORS issues between API Gateway and the frontend. The fix was adding the right headers to every Lambda response
- **Atomic operations in DynamoDB** - for the click counter I use an atomic increment (`ADD clickCount :one`) so there's no race condition if two people click at the same time

---

## Known issues / TODO

- [ ] Rate limiting - right now anyone could spam the API
- [ ] Auth - no login system, all links are public
- [ ] QR code generation would be cool to add
- [ ] Better error messages on the frontend
- [ ] Custom domain setup

---

## Cost

At my usage level (basically zero traffic) this costs almost nothing:

- Lambda: free tier (1M requests/month free)
- DynamoDB: free tier (25 GB storage free)
- API Gateway: ~$3.50 per million requests
- S3 + CloudFront: cents per month

---

## License

MIT © 2025 mahmoudz2000
