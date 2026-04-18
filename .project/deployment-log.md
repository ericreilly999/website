# Deployment Log

Deployments are recorded in reverse-chronological order.

---

## 2026-04-18 — Staging environment provisioned (Terraform)

**Method:** `terraform apply` (automated via PM)
**Resources created:** S3 bucket `ericreilly.com-staging`, CloudFront distribution `E2RCBOAESLBYM1`, ACM certificate for `staging.ericreilly.com`, Route 53 A/AAAA records, IAM role `eric-reilly-website-staging-deploy`
**Terraform state:** Migrated from local to S3 remote backend (`ericreilly-website-tfstate`)
**GitHub Actions:** Secret `STAGING_DEPLOY_ROLE_ARN` and variable `STAGING_CF_DIST_ID` set
**Status:** ✅ Infrastructure live — staging deploy will trigger on next push to `main`

---

## 2026-04-04 — v0.1.4 ��� Production

**Deployed by:** GitHub Actions (tag push)
**Commit:** 274f784 — "Refresh portfolio content and project storytelling"
**Environment:** Production — https://ericreilly.com
**S3 Bucket:** ericreilly.com-prod
**CloudFront Distribution:** EU0P2OBAYXZSI
**Status:** ✅ Live
**QA Sign-Off:** None on record

---

## 2026-03-28 — v0.1.1–v0.1.3 — Production (CI fixes)

**Deployed by:** GitHub Actions (tag pushes)
**Commits:** abdb653, ade570c, e0d67ad — CI/CD stabilisation (lockfile, yaml dep, optional build files)
**Environment:** Production
**Status:** ✅ Live
**Notes:** Series of small CI fixes following initial infrastructure setup.

---

## 2026-03-28 — v0.1.0 — Production (initial IaC deployment)

**Deployed by:** GitHub Actions (first tag push after Terraform IaC setup)
**Commit:** 15a4d75 — "Add Terraform-managed website infrastructure"
**Environment:** Production — https://ericreilly.com
**Status:** ✅ Live
**Notes:** First deployment with Terraform-managed infrastructure. IAM resources imported; OIDC deploy role active.

---

## 2026-03-23 — Pre-tag (manual / recovered)

**Method:** Manual S3 sync from recovered build
**Source:** `s3://ericreilly.com-prod` (recovered-build/)
**Status:** ✅ Was live prior to this repo being established
**Notes:** Baseline. Source recovered into `src/`. All subsequent deployments go through GitHub Actions.
