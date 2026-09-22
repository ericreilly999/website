---
# Project Status

**Last updated:** 2026-09-22
**Current stage:** Live / Ongoing Maintenance — CLD-13 shipped to production as `v0.1.8`; CLD-14 (ops & maintenance backlog) in progress this session, items 1-2 complete.
**Route-to-live:** Standard (`main` → staging auto-deploy → semver tag → prod)
**Linear project:** [website](https://linear.app/drinkupapp/project/website-b1cbb4812a78) (team Claude's Projects)

## Summary

The Eric Reilly personal website is live at https://ericreilly.com, staging at https://staging.ericreilly.com. Site is plain HTML (`public/`) with a shared design system (`shared.css`, dark by default, light theme available via the CLD-13 toggle); the `src/` React app is legacy and not part of the build.

The prior content-refresh story shipped end-to-end (three PRs, tag `v0.1.5`, verified live). Five further rounds of prose edits were made 2026-09-12/13, all merged, staged, QA-signed-off, and shipped to production — `v0.1.6` (Rounds 2-5) then `v0.1.7` (Round 6):
- **Round 2** (PR #11, `9c76ac1`), **Round 3** (PR #12, `6538352`), **Round 4** (PR #13, `b99703f`), **Round 5** (PR #14, `f2266c7`), **Round 6** (PR #15, `270558e`).

The light/dark theme toggle (CLD-13, PR #17) shipped to production `v0.1.8` on 2026-09-21 — sun/moon toggle on all 3 main-site pages, `localStorage`-persisted, dark remains default. Full detail above under "What We Just Completed (2026-09-21 — production promotion)".

## What We Just Completed (this session, 2026-09-19)

- Onboarded `website` to the fleet Linear dashboard: created Project `website` under team `Claude's Projects` (CLD), recorded `Linear project:` in `CLAUDE.md` (newly created — none existed before), created 3 epic-level issues (`CLD-12` Done, `CLD-13` Planning, `CLD-14` Planning). Full detail: `.project/workflow-state.md` "Linear Onboarding" entry.
- Recovered and committed (`08b2886`) a prior interrupted session's uncommitted Requirement Analyst work: `spec/light-mode-toggle.md`, `.project/TODO.md` (QA-07..09, DEV-05, DEV-06), `.project/decisions.md` Tier 2 record. Verified genuine before committing. Not implemented this session — this run's scope was Linear standardization only.

## What We Just Completed

- **PR #11** (`9c76ac1`, squash-merged) — Bio lede reworded, bio paragraph reworded, two banking-related highlights merged into one, AI-rollout/migrations/incidents bullets rewritten, skills grid updated. Bundled 2 previously-orphaned test-fix commits (`9d7264a`, `625bb76`).
- **PR #12** (`6538352`, squash-merged) — Hero tagline shortened ("i build stuff that scales"), 3 highlight bullets reworded again (banking bullet trimmed further, AWS DevOps Agent bullet restyled, migrations bullet tightened to "10+").
- **PR #13** (`b99703f`, squash-merged) — Hero sub-paragraph reworded (drops "Togetherwork"/"AI-native" framing, now "cloud native" / "PE-backed SaaS"), bio opener reworded ("These days, I'm standardizing..."), banking bullet reworded again ("Appointed platform owner for..."), delivery & leadership skills cell reworded, tagline capitalized ("I build stuff that scales").
- **PR #14** (`f2266c7`, squash-merged) — CTA text "Get in touch" → "Work with me" on the hero button, contact page meta description, and projects-page prose.
- **PR #15** (`270558e`, squash-merged) — Hero sub-paragraph ending reordered ("a portfolio of PE-backed SaaS products."), bio opener trimmed further ("standardizing reliability across a big SaaS portfolio").
- All five rounds independently QA-validated pre-merge and post-deploy on live staging (31/31, 58/58, 62/62, 73/73, 74/74), sign-off recorded in `test-signoff.md`.
- **Production deploys**: human approved twice — 2026-09-13 for `v0.1.6` ("I think this is good to ship to production") tagged from `main` @ `e400123` (workflow run [34763317301](https://github.com/ericreilly999/website/actions/runs/34763317301), both prod jobs ✅), then again for `v0.1.7` ("ship to prod immediately") tagged from `main` @ `861910f` (workflow run [34795972197](https://github.com/ericreilly999/website/actions/runs/34795972197), both prod jobs ✅). Live production verified via curl after each — all content changes confirmed present, logged in `deployment-log.md`.
- **Resume** (`C:\Users\EricW\Downloads\Eric_Reilly_Resume_2026-09-12.docx`, outside this repo) updated in parallel to match the site's new bullet language — banking bullet merged, AWS DevOps Agent bullet, 10+ migrations bullet, Sev 1/70% bullet, AI/LLM tooling skills updated. Bullet about eliminated manual hours/client credits kept its original hard numbers (1,000+ hours / 77%) per explicit instruction, diverging intentionally from the site's softer "countless hours / MTTR" phrasing. Note: Round 6's wording tweaks (hero sub-paragraph, bio opener) postdate the resume update and are not reflected there — resume still matches the state through Round 4.

## What We Just Completed (2026-09-20 — staging)

- **CLD-13 — Light/dark theme toggle, shipped to staging.** Human direction: "build the light/dark mode toggle and ship to staging." Ran the full pipeline in one session: QA wrote 21 Playwright tests (`e2e/theme-toggle.spec.js`) against `spec/light-mode-toggle.md` → Frontend implemented the light-theme CSS override + toggle UI/JS (`public/shared.css` + all 3 HTML pages) → Documentation Agent updated `README.md` → Code Reviewer blocked once for missing independent QA validation (consistent with this project's established pattern), QA independently confirmed 95/95 passing, Code Reviewer merged **PR #17** (`b23d4a9`) → staging auto-deployed, workflow run [35551660561](https://github.com/ericreilly999/website/actions/runs/35551660561) fully green → QA validated live staging, **95/95 passing, sign-off granted** (`test-signoff.md` commit `68f10c2`).
- Staging live: `https://staging.ericreilly.com`, `https://staging.prompted.ericreilly.com` — new sun/moon toggle in the nav on all 3 main-site pages, persists via `localStorage`, dark remains default.
- **Stopped at staging by design** — no production tag pushed. Prod deploy is Tier 3 (never autonomous); Eric would review staging and approve separately.
- Linear `CLD-13` moved `Planning` → `In Progress`, `[10%]`, checklist + comment refreshed.

## What We Just Completed (2026-09-21 — production promotion)

- **CLD-13 shipped to production.** Human approval landed on the Fleet Decisions page (decision `WS-2`, `answer.decided_by_owner === true`, decided `2026-09-21T16:57:51Z`) — verified directly, then executed: tagged `main` @ `77951eb` as `v0.1.8`, pushed; `Deploy Production` and `Deploy Prompted Production` both succeeded (workflow run [35675110707](https://github.com/ericreilly999/website/actions/runs/35675110707); logged in `.project/deployment-log.md` commit `5f06f30`). QA independently re-confirmed **95/95 passing live** against `https://ericreilly.com` (`.project/test-signoff.md` commit `b38827e`) — toggle present/functional/persistent on all 3 main-site pages, dark still the default.
- **Semver reconciliation:** chose `v0.1.8` over a stray `v1.0.0`–`v1.1.3` tag series (created 2026-04-18/19, orphaned — never part of this project's tracked `v0.1.x` release lineage in `deployment-log.md`/`workflow-state.md`, almost certainly leftover from a CI-debugging episode). Full rationale in `.project/decisions.md` (2026-09-21 entry).
- **Scope clarification:** `prompted.ericreilly.com` does not carry the toggle (fully self-contained static page, no `shared.css`/theme JS) — matches the original spec's scope (main site's 3 pages only), not a gap.
- **CLD-13 is Done.** Definition of Done fully met: QA sign-off ✅, docs in the PR #17 merge ✅, human approval of both the staging gate and the production promotion ✅.

## What We Just Completed (2026-09-22 — CLD-14 ops & maintenance backlog, in progress)

Eric asked (~11:30 ET) whether the ops & maintenance backlog was running — it wasn't; pulled `CLD-14` into session.
- **Item 1 (branch protection) — COMPLETE.** `main` now requires a PR to merge, blocks force-push/deletion, requires the branch be up to date. Required-approving-reviews deliberately `0` (no second reviewer exists on this solo-author repo — verified via API, not assumed). Required status checks deliberately empty (`deploy.yml` has no `pull_request` trigger yet). Full rule set in `.project/deployment-log.md`. Closing that status-check gap needs a new PR-triggered CI job — a new workflow trigger, Tier 3 (GH Actions minutes) — queued on the Fleet Decisions page as `WS-3` rather than built.
- **Item 2 (deploy.yml path filter) — COMPLETE.** PR #18 added a `paths:` allowlist so docs/test-only commits on `main` no longer re-trigger a staging deploy; tag-triggered prod deploys confirmed unaffected. QA independently verified both directions live (zero runs for a docs-only commit, a run within 3s for an app-code commit, all staging jobs green). Full detail in `.project/workflow-state.md`.
- **Item 3 (DEVOPS-04/05/06 Terraform follow-ups) — in progress**, see `.project/workflow-state.md` for scope split (prod-affecting `terraform apply` queued as Tier-3, non-prod items applied directly).

## What's In Progress

CLD-14 item 3 (Terraform PRs: `prevent_destroy` guards, prod-tag regex tightening, bootstrap resource tags).

## What's Coming Next

- Non-blocking follow-up from CLD-13: `contact.html` hardcodes the same production API endpoint in every environment, forcing 3 live-E2E tests in the theme-toggle spec to mock a network abort rather than exercise a real staging endpoint (pre-existing constraint, not new risk — see `lessons-learned.md` 2026-09-20). Provision a staging-only contact endpoint, or formally document the deviation in `test-signoff.md`'s conventions.
- Fleet Decisions `WS-3` (add a `pull_request`-triggered CI job so branch protection's required status checks can be populated) — queued, not yet human-decided.
- Item 3's prod-affecting `terraform apply` (DEVOPS-04, `prevent_destroy` on prod S3/CloudFront/Route53) — will be queued as its own Fleet Decisions `WS-` item once the Terraform PR is ready, per this run's brief.
- The `odds-analysis` repo (source of the Football Odds Analysis Engine card) is genuinely early-stage — revisit once that project has real output.
- `.project/TODO.md` has no entries for any prose round (PM decided not to backfill for copy-only micro-rounds; noted for traceability).

## Risks

| Risk | Impact | Owner | Status |
|------|--------|-------|--------|
| No branch protection on `main` | **Resolved 2026-09-22** — PR now required, force-push/deletion blocked. Required-approving-reviews and required-status-checks both deliberately `0`/empty (no second reviewer, no PR-triggered check exists yet — see `WS-3`). Self-approval limitation still applies to Code Reviewer's workflow (posts findings as comments, doesn't formally approve) | PM | Closed |
| `deploy.yml` has no path filter | **Resolved 2026-09-22** — `paths:` allowlist added (PR #18), QA-verified both directions live | DevOps | Closed |
| Sequential PRs cut from a stale base can silently conflict | Low, now mitigated by process — see `lessons-learned.md` (2026-09-08 entry on PR #10's stale-base conflict) | PM | Watched |
| Subagents operating in the shared primary working directory (not an isolated worktree) can run destructive git ops (branch checkout/reset) that discard other uncommitted work in that tree | **Realized 2026-09-12** — a Frontend Engineer dispatch's branch checkout wiped out PM's uncommitted `workflow-state.md`/`project-status.md` updates (recovered from conversation context) and pre-existing uncommitted content in `decisions.md`/`deployment-log.md` predating this session (~94 lines, **not recoverable**). Fix: dispatch git-mutating agents with `isolation: "worktree"` going forward. **2026-09-20: worktree isolation itself was unavailable all session (host-environment tool error)** — mitigated by strict serialization + PM commit-before-dispatch, no data loss, but two stray-commit near-misses occurred (PM committed to the wrong branch twice, caught and fixed both times). See `lessons-learned.md` 2026-09-20. | PM | Open — mitigation identified, not yet standard practice; worktree tool itself currently broken |
| `contact.html` hardcodes the same production contact-form API endpoint in every environment (no staging-specific endpoint) | Low/Medium — `contact.spec.js` has never driven a real submission in staging; new `theme-toggle.spec.js` (CLD-13) had to mock a network abort for 2 tests rather than exercise a real endpoint. Pre-existing constraint, not new risk, but `test-signoff.md`'s pre-merge sign-off inaccurately claimed a clean RULE-1 (no-mocks) grep as a result — caught one stage later, not blocking. See `lessons-learned.md` 2026-09-20. | DevOps / QA | Open |

## Blockers

None.
