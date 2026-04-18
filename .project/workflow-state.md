---
# Workflow State

## Route-to-Live
**Simple** — `local dev → production`

No staging environment. Tag pushes to `main` trigger the production deploy pipeline.

## Current Stage
**Live / Ongoing Maintenance**

The site is deployed and live at https://ericreilly.com. There is no active development sprint. The next work will enter at Stage 0 (kickoff) when a new feature or change is scoped.

## Last Gate Cleared
Stage 8 — Production deployed (v0.1.4 is the latest known tag)

## Active Route
```
commit to main → tag release → GitHub Actions builds & deploys → S3 + CloudFront invalidation
```

## Next Action
Sprint complete. All code is on `main`. Human must run the bootstrap + Terraform steps to provision staging in AWS, then set the two GitHub Actions values. Once staging is live, the next push to `main` will trigger the full staging deploy → E2E gate pipeline for the first time.

## Gate Status

| Gate | Status | Notes |
|------|--------|-------|
| Stage 0 — Kickoff | ✅ | Project bootstrapped from recovered S3 build |
| Stage 1 — Test writing | ⚠️ Partial | Unit tests exist for About/Projects pages; no formal QA sign-off cycle run |
| Stage 2 — Development | ✅ | All known features implemented |
| Stage 3 — Code Review | ⚠️ Not enforced | No branch protection or required reviews on main |
| Stage 4 — Deploy to Dev | N/A | No dev environment; simple route |
| Stage 5 — QA Validation | ⚠️ Partial | `npm test` gates deploys in CI; no browser/E2E validation |
| Stage 8 — Production | ✅ | Live at https://ericreilly.com |
