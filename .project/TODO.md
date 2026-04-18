# TODO

## Active Sprint

### DEVOPS Tasks

- [x] **DEVOPS-01** — Bootstrap S3 remote backend for Terraform state
  - Create `ericreilly-website-tfstate` S3 bucket (versioning on, encryption on) and DynamoDB lock table via AWS CLI bootstrap script
  - Add `backend "s3"` block to `terraform/main.tf`
  - Run `terraform init -migrate-state` to migrate local state
  - Commit backend config; confirm state is in S3
  - Depends On: —

- [x] **DEVOPS-02** — Add staging environment Terraform resources
  - Add staging module instantiation in `terraform/main.tf` (or new workspace): S3 bucket `ericreilly.com-staging`, CloudFront distribution, DNS record `staging.ericreilly.com`, staging deploy IAM role
  - Reuse existing ACM certificate (add `staging.ericreilly.com` as SAN) or issue separate cert
  - Reuse existing OIDC provider
  - Depends On: DEVOPS-01 (remote state should be in place before adding resources)

- [x] **DEVOPS-03** — Update CI/CD pipeline for staging deploy

### Post-merge follow-ups (reviewer warnings — scope separately)
- [ ] **DEVOPS-04** — Add `prevent_destroy` lifecycle guard on prod S3 bucket, CloudFront, Route 53 zone
- [ ] **DEVOPS-05** — Tighten `deploy-prod` `if` guard to `refs/tags/v` (defence-in-depth)
- [ ] **DEVOPS-06** — Add resource tags to bootstrap-backend.sh S3 bucket and DynamoDB table

### QA Tasks

- [x] **QA-01** — Add Playwright E2E tests for golden-path user flows
  - Install Playwright (`@playwright/test`) as a dev dependency
  - Write tests: homepage loads, nav links work, About page content renders, Projects page shows cards with links, Contact form is visible
  - Configure base URL via env var (`PLAYWRIGHT_BASE_URL`) so tests run against staging or prod
  - Add `npm run test:e2e` script to `package.json`
  - Depends On: — (write against prod URL initially; staging URL swapped in once DEVOPS-02 is done)

- [x] **QA-02** — Wire E2E tests into CI pipeline
  - Add E2E test step to `deploy.yml` staging job: run after deploy, against staging URL
  - Gate prod deploy on staging E2E pass (or run E2E as post-deploy smoke test)
  - Depends On: QA-01, DEVOPS-03

---

## Backlog (unscoped)

- [ ] Enforce branch protection on `main` (require PR review before merge)
- [x] Remove or archive `recovered-build/` directory — source now lives in `src/`
