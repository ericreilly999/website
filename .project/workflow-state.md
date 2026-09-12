---
# Workflow State

## Route-to-Live
**Standard** — `main → staging (auto) → prod (tag)`

Push to `main` auto-deploys to `staging.ericreilly.com` (and `staging.prompted.ericreilly.com`) and runs the Playwright E2E gate against staging. A semver tag push (`vX.Y.Z`) deploys to production (`ericreilly.com` and `prompted.ericreilly.com`).

## Current Stage
**Stage 1/2 — Prose Refresh Round 2 (in flight)**

Prior content-refresh story (rewrite + portfolio overhaul + human-directed follow-up) shipped to prod as `v0.1.5`. A new round of copy edits was requested 2026-09-12 (bio lede/paragraph, highlights list, skills grid). Working on branch `content/project-portfolio-followup`, which was found to already carry 2 unmerged commits (`9d7264a`, `625bb76` — post-merge test-assertion fixes for QA-06's repo-link count) with no open PR — these will ride in the same PR as this round's changes.

## Last Gate Cleared (prior story)
Prod Deploy — human explicitly approved ("ship the changes to prod"). Tagged and pushed `v0.1.5` from `main` tip `afac3632`.
- Workflow run [34302193693](https://github.com/ericreilly999/website/actions/runs/34302193693): `deploy-prod` ✅ `deploy-prompted-prod` ✅.
- Live production verified twice. No discrepancies.

## Active Route (this round)
```
[~] QA updates e2e/about.spec.js assertions (53% -> 70%, drop 77%/1,000+ literals)
  → [ ] Frontend implements copy changes in public/index.html
  → [ ] Documentation Agent (doc-impact check) → [ ] Code Reviewer → merge to main
  → [ ] Auto-deploy to staging → [ ] QA validates staging locally
  → [ ] Report to human — no prod tag requested this round
```

## Next Action
Invoke QA Engineer to update e2e assertions ahead of the copy change (TDD gate).

## Gate Status

| Gate | Status | Notes |
|------|--------|-------|
| Stage 0 — Kickoff | ✅ | (prior story) Project bootstrapped from recovered S3 build |
| Stage 1 — Test writing | [~] | This round: QA updating about.spec.js for new percentages/phrasing |
| Stage 2 — Development | [ ] | This round: Frontend to edit public/index.html copy |
| Stage 3 — Code Review | [ ] | Docs-impact check + Code Reviewer merge, bundling orphaned commits 9d7264a/625bb76 |
| Stage 4 — Deploy to Staging | [ ] | Auto on merge to main (no `paths:` filter yet — known risk, unchanged) |
| Stage 5 — QA Validation (staging) | [ ] | Local Playwright run against staging per ci-discipline |
| Prod Deploy | Not requested this round | Human asked only for staging |
