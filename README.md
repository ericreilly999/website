# Eric Reilly Website

Personal website for [ericreilly.com](https://ericreilly.com) — static HTML with a shared design system supporting light and dark themes (dark by default, user-toggleable, persisted per-browser via `localStorage`). Three pages: about, projects, contact. Deployed to S3 + CloudFront via GitHub Actions with OIDC.

---

## Structure

```
public/
  index.html       # About / homepage
  projects.html    # Projects listing
  contact.html     # Contact form
  shared.css       # Design system (light/dark theme via CSS custom properties, JetBrains Mono, Instrument Serif)
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

## Making a change

`main` is protected. Changes land via pull request:

```bash
git checkout -b my-change
# ...edit files...
git commit -am "..."
git push -u origin my-change
gh pr create
```

Opening a PR against `main` triggers the **PR Checks** job (`npm ci` + `npm test`, no build and no AWS credentials). It is the required status check — a PR cannot merge until it passes, and `main` must be up to date with the base branch first (strict mode). Required approving reviews are set to **0**, since this is a solo-author repo; merging is gated on CI, not on a second reviewer.

Branch protection on `main`:

| Rule | Setting |
|------|---------|
| Pull request required to merge | Yes |
| Required approving reviews | 0 |
| Required status check | `PR Checks` |
| Require branch up to date (`strict`) | Yes |
| Force pushes | Blocked |
| Branch deletion | Blocked |
| Enforced for admins | No |

Because admin enforcement is off, the repo owner can still push directly to `main` — that escape hatch exists for trivial docs-only commits, not as the normal path.

---

## Environments

| Environment | URL | Deploy trigger |
|-------------|-----|----------------|
| Staging | `https://staging.ericreilly.com` | Push to `main` touching a deployable path (see below) |
| Production | `https://ericreilly.com` | Semver tag (e.g. `v1.0.0`) |

---

## Deployment

```bash
# Deploy to staging (automatic once a PR merges to main)
gh pr merge --squash

# Deploy to production
git tag v1.0.0
git push origin v1.0.0
```

The staging trigger is path-filtered with an allowlist, so docs-only, test-only, and tracking-file commits on `main` no longer redeploy staging. A push to `main` deploys only if it touches one of:

```
public/**
prompted/**
package.json
package-lock.json
.github/workflows/deploy.yml
```

Anything else (including any future new top-level directory) does **not** trigger a staging deploy unless added to that list. The path filter does not apply to the production tag trigger — GitHub Actions does not evaluate path filters for tag pushes, so a matching semver tag always deploys prod.

The `deploy.yml` workflow:
0. On a pull request: runs the `PR Checks` job only (`npm ci` + `npm test`) — no build, no deploy, no AWS credentials
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

The content S3 buckets, CloudFront distributions, and the Route 53 hosted zone carry `lifecycle { prevent_destroy = true }`. Any plan that would destroy or replace them fails until the guard is removed in a deliberate, reviewed commit.

State is stored remotely in S3, in a bucket and DynamoDB lock table provisioned by `terraform/bootstrap-backend.sh`.
