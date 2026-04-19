# Eric Reilly Website

Personal website for [ericreilly.com](https://ericreilly.com) — static HTML with a shared dark-theme design system. Three pages: about, projects, contact. Deployed to S3 + CloudFront via GitHub Actions with OIDC.

---

## Structure

```
public/
  index.html       # About / homepage
  projects.html    # Projects listing
  contact.html     # Contact form
  shared.css       # Design system (dark theme, JetBrains Mono, Instrument Serif)
  whiteglovesolutions.png  # Favicon
  robots.txt
terraform/         # Production AWS infrastructure (Terraform)
.github/workflows/
  deploy.yml       # CI/CD pipeline
e2e/               # Playwright end-to-end tests
```

---

## Development

No framework or build step — pages are plain HTML. `npm run build` just copies `public/` to `build/`.

```bash
npm install        # installs Playwright for E2E tests only
npm run build      # copies public/ → build/
npm run test:e2e   # runs Playwright tests (requires a live base URL)
```

To preview locally, open any file in `public/` directly in a browser, or serve the directory:

```bash
npx serve public
```

---

## Environments

| Environment | URL | Deploy trigger |
|-------------|-----|----------------|
| Staging | `https://staging.ericreilly.com` | Push to `main` |
| Production | `https://ericreilly.com` | Semver tag (e.g. `v1.0.0`) |

---

## Deployment

```bash
# Deploy to staging (automatic on push to main)
git push origin main

# Deploy to production
git tag v1.0.0
git push origin v1.0.0
```

The `deploy.yml` workflow:
1. Runs `npm test` (no-op for unit tests)
2. Builds the site (`npm run build`)
3. For staging: patches the prompted link to point at `staging.prompted.ericreilly.com`
4. Syncs `build/` to the S3 bucket
5. Uploads HTML pages without `.html` extension so `/projects` and `/contact` resolve cleanly
6. Invalidates the CloudFront distribution

AWS credentials are obtained via OIDC — no long-lived secrets required.

| Environment | IAM role | S3 bucket | CloudFront ID |
|-------------|----------|-----------|---------------|
| Staging | `${{ secrets.STAGING_DEPLOY_ROLE_ARN }}` | `ericreilly.com-staging` | `${{ vars.STAGING_CF_DIST_ID }}` |
| Production | `arn:aws:iam::290993374431:role/eric-reilly-website-prod-deploy` | `ericreilly.com-prod` | `EU0P2OBAYXZSI` |

---

## Contact API

The contact form on `/contact` posts to a shared Lambda-backed API:

```
POST https://k7cpfmv07e.execute-api.us-east-1.amazonaws.com/prod/contact
Content-Type: application/json

{ "name": "...", "email": "...", "company": "...", "project": "...", "term": "..." }
```

The same API handles prompt submissions from `prompted.ericreilly.com` (uses `{ "message": "..." }` format instead).

---

## Terraform

Infrastructure in `terraform/` manages the production AWS resources:

- S3 bucket (`ericreilly.com-prod`)
- CloudFront distribution (`EU0P2OBAYXZSI`)
- Route 53 hosted zone (`Z09302003LDW15NJ86V5W`) and records
- ACM certificate
- GitHub OIDC provider and deploy IAM role

State is stored remotely in S3. See `terraform/` for setup instructions.
