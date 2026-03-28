# Eric Reilly Website

This repo was recovered from the deployed S3 site on 2026-03-23 from `s3://ericreilly.com-prod`.

## What is here

- `src/` contains the React source recovered from the production source maps.
- `public/` contains the static assets and SEO files used by the site.
- `recovered-build/` preserves the exact deployed build that was downloaded from S3.

## Development

1. Install dependencies with `npm install`.
2. Start the app with `npm start`.
3. Build a production bundle with `npm run build`.

## Environment

The contact form uses `REACT_APP_CONTACT_API_URL`.

- Default production endpoint: `https://k7cpfmv07e.execute-api.us-east-1.amazonaws.com/prod/contact`
- Copy `.env.example` to `.env.local` and change it if you want to point the form at a different API.

## Deployment

GitHub Actions deployment is defined in `.github/workflows/deploy.yml`.

- Tag pushes deploy to production.
- The workflow hardcodes AWS region `us-east-1`.
- The workflow deploys to the live production site only.
- The workflow uses GitHub OIDC and assumes `arn:aws:iam::290993374431:role/eric-reilly-website-prod-deploy`.

### GitHub configuration

No long-lived AWS secrets are required after the Terraform IAM resources are applied.

- GitHub Actions needs `id-token: write`, which is already set in the workflow.
- The repo just needs permission to run the workflow on tag pushes.

### Production values discovered in AWS on 2026-03-28

- `S3 bucket: ericreilly.com-prod`
- `CloudFront distribution ID: EU0P2OBAYXZSI`
- `Contact API URL: https://k7cpfmv07e.execute-api.us-east-1.amazonaws.com/prod/contact`

## Terraform

Terraform for the production website lives in `terraform/`.

- The root Terraform configuration is a single `terraform/main.tf` that only wires local modules together.
- Existing production resources are modeled there and can be imported with `terraform/import-existing.ps1`.
- A credential-aware plan helper is available at `terraform/plan.ps1`.
- The Terraform stack manages the website bucket, Route 53 zone and records, ACM certificate, CloudFront distribution, GitHub OIDC provider, and deploy role/policy.

### Current imported production resources

- Route 53 hosted zone: `Z09302003LDW15NJ86V5W`
- ACM certificate ARN: `arn:aws:acm:us-east-1:290993374431:certificate/756e2d67-7ae2-4b63-9405-ff3239198e02`
- S3 bucket: `ericreilly.com-prod`
- CloudFront distribution: `EU0P2OBAYXZSI`

### Local Terraform workflow

1. Run `aws login` if your AWS CLI session is expired.
2. Run `powershell -ExecutionPolicy Bypass -File .\terraform\import-existing.ps1` once for a fresh local state file.
3. Run `powershell -ExecutionPolicy Bypass -File .\terraform\plan.ps1` to generate `terraform/website.tfplan`.
