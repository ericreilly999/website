---
# Project Status

**Last updated:** 2026-04-18
**Current stage:** Live / Ongoing Maintenance
**Route-to-live:** Simple (tag → prod)

## Summary

The Eric Reilly personal website is live at https://ericreilly.com. Source code was recovered from the deployed S3 bucket in March 2026, Terraform infrastructure was codified, and content was refreshed. The site is fully operational.

## What We Just Completed

- Staging environment (S3, CloudFront, ACM cert, DNS, IAM role) — Terraform ready, pending `terraform apply`
- S3 remote backend for Terraform state + DynamoDB lock table bootstrap script
- CI/CD split: push to `main` → staging deploy; semver tag → prod deploy
- 58 Playwright E2E tests across 5 spec files (homepage, nav, about, projects, contact)
- E2E gate in CI: staging E2E runs after every staging deploy; failures block prod path
- Portfolio content refresh and project storytelling (2026-04-04)
- Terraform-managed infrastructure for S3, CloudFront, Route 53, ACM, and GitHub OIDC deploy role
- CI/CD pipeline via GitHub Actions (tag-triggered deploy to production)
- Source code recovered from S3 production build into `src/`
- Unit tests written for About and Projects pages

## What's In Progress

Awaiting human to run bootstrap + Terraform steps to provision staging in AWS.

## What's Coming Next

No scheduled work. Potential items:
- Add E2E/browser tests (Playwright or Cypress) — currently a gap
- Add a dev/staging environment for safer changes
- Enforce branch protection rules and required PR reviews on `main`

## Risks

| Risk | Impact | Owner | Status |
|------|--------|-------|--------|
| No staging environment | High — all changes go directly to production | PM | Open |
| No branch protection on `main` | Medium — unreviewed pushes can go live | PM | Open |
| No E2E/browser tests | Medium — visual regressions undetected until live | QA | Open |
| Terraform state not remote | Low — local tfstate risks drift on other machines | DevOps | Open |

## Blockers

None.
