---
# Project Status

**Last updated:** 2026-09-13
**Current stage:** Live / Ongoing Maintenance — all five prose-refresh rounds shipped to production as `v0.1.6`. Story closed.
**Route-to-live:** Standard (`main` → staging auto-deploy → semver tag → prod)

## Summary

The Eric Reilly personal website is live at https://ericreilly.com, staging at https://staging.ericreilly.com. Site is plain HTML (`public/`) with a shared dark-theme design system; the `src/` React app is legacy and not part of the build.

The prior content-refresh story shipped end-to-end (three PRs, tag `v0.1.5`, verified live). Four further rounds of prose edits were made 2026-09-12/13, all merged, staged, QA-signed-off, and now shipped to production as tag `v0.1.6`:
- **Round 2** (PR #11, `9c76ac1`), **Round 3** (PR #12, `6538352`), **Round 4** (PR #13, `b99703f`), **Round 5** (PR #14, `f2266c7`).

## What We Just Completed

- **PR #11** (`9c76ac1`, squash-merged) — Bio lede reworded, bio paragraph reworded, two banking-related highlights merged into one, AI-rollout/migrations/incidents bullets rewritten, skills grid updated. Bundled 2 previously-orphaned test-fix commits (`9d7264a`, `625bb76`).
- **PR #12** (`6538352`, squash-merged) — Hero tagline shortened ("i build stuff that scales"), 3 highlight bullets reworded again (banking bullet trimmed further, AWS DevOps Agent bullet restyled, migrations bullet tightened to "10+").
- **PR #13** (`b99703f`, squash-merged) — Hero sub-paragraph reworded (drops "Togetherwork"/"AI-native" framing, now "cloud native" / "PE-backed SaaS"), bio opener reworded ("These days, I'm standardizing..."), banking bullet reworded again ("Appointed platform owner for..."), delivery & leadership skills cell reworded, tagline capitalized ("I build stuff that scales").
- **PR #14** (`f2266c7`, squash-merged) — CTA text "Get in touch" → "Work with me" on the hero button, contact page meta description, and projects-page prose.
- All four rounds independently QA-validated pre-merge and post-deploy on live staging (31/31, 58/58, 62/62, 73/73), sign-off recorded in `test-signoff.md`.
- **Production deploy**: human approved 2026-09-13 ("I think this is good to ship to production"). Tagged and pushed `v0.1.6` from `main` @ `e400123`. Workflow run [34763317301](https://github.com/ericreilly999/website/actions/runs/34763317301): `deploy-prod` ✅ `deploy-prompted-prod` ✅. Live production verified via curl — all content changes confirmed present, logged in `deployment-log.md`.
- **Resume** (`C:\Users\EricW\Downloads\Eric_Reilly_Resume_2026-09-12.docx`, outside this repo) updated in parallel to match the site's new bullet language — banking bullet merged, AWS DevOps Agent bullet, 10+ migrations bullet, Sev 1/70% bullet, AI/LLM tooling skills updated. Bullet about eliminated manual hours/client credits kept its original hard numbers (1,000+ hours / 77%) per explicit instruction, diverging intentionally from the site's softer "countless hours / MTTR" phrasing.

## What's In Progress

Nothing. Human approved and the story shipped to production: tag `v0.1.6`, workflow run 34763317301 fully green, live production verified.

## What's Coming Next

No scheduled work. Open backlog items, unchanged by these rounds:
- Enforce branch protection rules and required PR reviews on `main`
- DEVOPS-04/05/06 post-merge follow-ups (prevent_destroy lifecycle guards, prod-tag regex tightening, bootstrap resource tags)
- `deploy.yml` has no `paths:` filter — even a test-only merge re-triggers full staging deploy jobs (flagged by Code Reviewer on PR #9, still open)
- The `odds-analysis` repo (source of the Football Odds Analysis Engine card) is genuinely early-stage — revisit once that project has real output
- `.project/TODO.md` has no entries for any prose round (PM decided not to backfill for copy-only micro-rounds; noted for traceability)

## Risks

| Risk | Impact | Owner | Status |
|------|--------|-------|--------|
| No branch protection on `main` | Medium — unreviewed pushes can go live; also blocks formal self-approval on this solo-author repo (GitHub rejects it), so Code Reviewer posts findings as comments instead | PM | Open |
| `deploy.yml` has no path filter | Low — CI-minute waste on docs/test-only commits | DevOps | Open |
| Sequential PRs cut from a stale base can silently conflict | Low, now mitigated by process — see `lessons-learned.md` (2026-09-08 entry on PR #10's stale-base conflict) | PM | Watched |
| Subagents operating in the shared primary working directory (not an isolated worktree) can run destructive git ops (branch checkout/reset) that discard other uncommitted work in that tree | **Realized 2026-09-12** — a Frontend Engineer dispatch's branch checkout wiped out PM's uncommitted `workflow-state.md`/`project-status.md` updates (recovered from conversation context) and pre-existing uncommitted content in `decisions.md`/`deployment-log.md` predating this session (~94 lines, **not recoverable**). Fix: dispatch git-mutating agents with `isolation: "worktree"` going forward. | PM | Open — mitigation identified, not yet standard practice |

## Blockers

None.
