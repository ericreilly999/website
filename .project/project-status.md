---
# Project Status

**Last updated:** 2026-09-12
**Current stage:** Prose Refresh Round 2 — in flight (QA updating e2e assertions ahead of copy change)
**Route-to-live:** Standard (`main` → staging auto-deploy → semver tag → prod)

## Summary

The Eric Reilly personal website is live at https://ericreilly.com, staging at https://staging.ericreilly.com. Site is plain HTML (`public/`) with a shared dark-theme design system; the `src/` React app is legacy and not part of the build.

The prior content-refresh story shipped end-to-end (three PRs, tag `v0.1.5`, verified live). A new round of prose edits (bio, highlights, skills grid) was requested 2026-09-12 — human asked for staging only, no prod tag this round. Working on the existing `content/project-portfolio-followup` branch, which was found to hold 2 already-committed but unmerged post-merge test fixes (`9d7264a`, `625bb76`); these will merge together with this round's changes in one PR.

## What We Just Completed

- **PR #8** (`96aa523`) — Projects page refreshed against GitHub state, homepage voice rewrite, zero em dashes, LinkedIn URL fix.
- **PR #9** (`fb6bac5`) — Fix-forward: shipped QA test updates missed in #8's merge.
- **PR #10** (`afac3632`) — Human-directed portfolio follow-up: removed AI Assistant MVP Scaffold and Inventory Management System entirely; added a new Football Odds Analysis Engine card (private, very early-stage, kicked off 2026-09-07 — sourced honestly from the real local project, not fabricated); reordered the whole portfolio to DrinkUp → Stock Analysis Engine → Football Odds Analysis Engine → Prompted: Tech Talks → Pokemon Tuxedo → Personal Website; de-hedged a Pokemon Tuxedo bullet; dropped a stale DrinkUp bullet.
- Workflow run [34265154557](https://github.com/ericreilly999/website/actions/runs/34265154557): staging deploy + E2E gate fully green, live sanity check confirmed 6 rows in the correct order.
- Site now shows 6 projects (down from 7), 3 with public repo links (Prompted, Pokemon, Personal Website) and 3 private (DrinkUp, Stock Analysis Engine, Football Odds Analysis Engine).

## What's In Progress

Nothing. Human approved and the story shipped to production: tag `v0.1.5`, workflow run [34302193693](https://github.com/ericreilly999/website/actions/runs/34302193693) fully green, live production independently verified (exact 6-row order, both decommissioned cards absent, correct repo-link split, LinkedIn URL corrected).

## What's Coming Next

No scheduled work. Open backlog items, unchanged by this story:
- Enforce branch protection rules and required PR reviews on `main`
- DEVOPS-04/05/06 post-merge follow-ups (prevent_destroy lifecycle guards, prod-tag regex tightening, bootstrap resource tags)
- `deploy.yml` has no `paths:` filter — even a test-only merge re-triggers full staging deploy jobs (flagged by Code Reviewer on PR #9)
- The `odds-analysis` repo (source of the new Football Odds Analysis Engine card) is genuinely early-stage — the card should be revisited once that project has real output, per the human's own framing

## Risks

| Risk | Impact | Owner | Status |
|------|--------|-------|--------|
| No branch protection on `main` | Medium — unreviewed pushes can go live; also blocks formal self-approval on this solo-author repo (GitHub rejects it), so Code Reviewer posts findings as comments instead | PM | Open |
| `deploy.yml` has no path filter | Low — CI-minute waste on docs/test-only commits | DevOps | Open |
| Sequential PRs cut from a stale base can silently conflict | Low, now mitigated by process — see `lessons-learned.md` (2026-09-08 entry on PR #10's stale-base conflict) | PM | Watched |

## Blockers

None.
