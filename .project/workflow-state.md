---
# Workflow State

## Route-to-Live
**Standard** — `main → staging (auto) → prod (tag)`

Push to `main` auto-deploys to `staging.ericreilly.com` (and `staging.prompted.ericreilly.com`) and runs the Playwright E2E gate against staging. A semver tag push (`vX.Y.Z`) deploys to production (`ericreilly.com` and `prompted.ericreilly.com`).

## Current Stage
**Live / Ongoing Maintenance — all six rounds shipped to production as `v0.1.7`. Story closed.**

Prior content-refresh story shipped to prod as `v0.1.5`. Five further rounds of copy edits were made 2026-09-12/13, all merged, staged, QA-signed-off, and now live in production:
- **Round 2** (PR #11, `9c76ac1`) — bio lede/paragraph, highlights list, skills grid.
- **Round 3** (PR #12, `6538352`) — hero tagline shortened, 3 highlight bullets reworded.
- **Round 4** (PR #13, `b99703f`) — hero sub-paragraph reworded (drops "Togetherwork"/"AI-native"), bio opener reworded, banking bullet reworded ("Appointed platform owner for..."), delivery & leadership skills cell reworded, tagline "i"→"I" capitalized.
- **Round 5** (PR #14, `f2266c7`) — CTA text "Get in touch" → "Work with me" (hero button, contact meta description, projects prose).
- **Round 6** (PR #15, `270558e`) — hero sub-paragraph ending reordered ("a portfolio of PE-backed SaaS products."), bio opener trimmed ("standardizing reliability across a big SaaS portfolio").

Human approved production promotion twice: 2026-09-13 for `v0.1.6` ("I think this is good to ship to production"), then again for `v0.1.7` ("ship to prod immediately"). Tag `v0.1.7` pushed from `main` @ `861910f`, `deploy-prod` + `deploy-prompted-prod` both green, live content independently verified via curl against `https://ericreilly.com`.

## Last Gate Cleared (prior prod story)
Prod Deploy — human explicitly approved ("ship the changes to prod"). Tagged and pushed `v0.1.5` from `main` tip `afac3632`.
- Workflow run [34302193693](https://github.com/ericreilly999/website/actions/runs/34302193693): `deploy-prod` ✅ `deploy-prompted-prod` ✅.
- Live production verified twice. No discrepancies.

## Active Route

**Round 2 (PR #11) — COMPLETE through Stage 5.** QA wrote/updated assertions → Frontend implemented → Docs (no impact) → Code Reviewer blocked once (missing independent QA re-validation) → QA independent pass (31/31) → Code Reviewer merged (`9c76ac1`) → staging deploy green (run 34702470524) → QA staging sign-off (31/31, `test-signoff.md` commit `92f2458`).

**Round 3 (PR #12) — COMPLETE through Stage 5.** QA wrote/updated assertions (`homepage.spec.js`, `about.spec.js`) → Frontend implemented → QA independent pass (58/58, built in proactively) → Docs (no impact) → Code Reviewer merged clean (`6538352`) → staging deploy green (run [34704340442](https://github.com/ericreilly999/website/actions/runs/34704340442)) → QA staging sign-off (58/58, `test-signoff.md` commit `cd03314`).

**Round 4 (PR #13) — COMPLETE through Stage 5.** QA located strings, wrote/updated assertions (5 checks, commit `ddfbf29`, confirmed 5 red/57 green) → Frontend implemented → QA independent pass (62/62, commit `9a4febf`) → PR #13 opened → Documentation Agent (no doc impact) → Code Reviewer merged clean (`b99703f`) → staging deploy green (run [34718497465](https://github.com/ericreilly999/website/actions/runs/34718497465)) → QA staging sign-off (62/62).

**Round 5 (PR #14) — COMPLETE through Stage 5.** QA located 3 "get in touch" occurrences, wrote assertions (commit `ccdb092`, confirmed 3 red/70 green) → Frontend implemented → QA independent pass (73/73, commit `cb283eb`) → PR #14 opened → Documentation Agent (no doc impact) → Code Reviewer merged clean (`f2266c7`) → staging deploy green (run [34763041660](https://github.com/ericreilly999/website/actions/runs/34763041660)) → QA staging sign-off (73/73, `test-signoff.md` commit `fc100b3`).

**Round 6 (PR #15) — COMPLETE through Stage 5.** QA located both strings, wrote assertions (commits `d487e1b`, `6a02850`, confirmed 2 red/72 green) → Frontend implemented → QA independent pass (74/74, commit `fb47468`) → PR #15 opened → Documentation Agent (no doc impact) → Code Reviewer merged clean (`270558e`) → staging deploy green (run [34795666261](https://github.com/ericreilly999/website/actions/runs/34795666261)) → QA staging sign-off (74/74, `test-signoff.md` commit `861910f`).

## Linear Onboarding — 2026-09-19
Onboarded to the fleet Linear dashboard per `~/.claude/docs/agent-conventions/linear.md`. Project `website` created under team `Claude's Projects` (CLD): https://linear.app/drinkupapp/project/website-b1cbb4812a78. `Linear project:` line recorded in `CLAUDE.md`. Three epics created (status per `list_issue_statuses`, no duplicate-name ambiguity hit for `Done`/`Planning`):
- `CLD-12` — `[100%] Content refresh — prose rounds 2-6` — **Done**
- `CLD-13` — `[0%] Light/dark theme toggle` — **Planning**
- `CLD-14` — `[0%] Ops & maintenance backlog` — **Planning**

Same session: recovered uncommitted PM/RA artifacts from an interrupted 2026-09-14 session (`.project/TODO.md` QA-07..09/DEV-05..06, `.project/decisions.md` Tier 2 record, new `spec/light-mode-toggle.md`) — verified genuine, committed to `main` (`08b2886`). This is the source scope behind `CLD-13`; not started this session (no QA test-writing dispatched) since this run's focus was Linear standardization, not new dev. Ready to pull next session via normal Stage 1 (QA Engineer).

## Active Route — CLD-13 Light/Dark Theme Toggle (2026-09-20)

Human direction this session (verbatim, recorded in `.project/decisions.md`): **"build the light/dark mode toggle and ship to staging."** Pulled `CLD-13` into the active sprint. Session-open ritual clean: `main` @ `a62d012` (PR #16, SES DKIM for gencast, merged same day, unrelated to this feature), no open PRs, no `deploy-failure` issues, no orphaned in-flight work.

Plan: Stage 1 (QA writes `e2e/theme-toggle.spec.js` for QA-07..QA-09 against `spec/light-mode-toggle.md`) → Stage 2 (Frontend implements DEV-05/DEV-06) → Stage 3 (Documentation Agent → Code Reviewer → merge) → Stage 4 (auto staging deploy, PM blocks on foreground until-loop) → Stage 5 (QA full E2E sign-off on `staging.ericreilly.com`). **Stops at staging** — prod tag push is Tier 3 (human explicitly deferred approval to after viewing staging); queued, not executed, this session.

Fleet-mode note: dispatched engineers use `isolation: "worktree"`, git-writing dispatches serialized (QA → Frontend → Docs → Code Reviewer, one at a time) per this run's override instructions.

**Stage 1 — COMPLETE.** QA Engineer wrote `e2e/theme-toggle.spec.js` (21 tests: QA-07 toggle presence/accessibility, QA-08 behavior/persistence/FOUC/storage-failure, QA-09 light-mode computed-style + hardcoded-hex regression) on branch `feature/light-dark-toggle` off `main` @ `042c982` (commits `7b7335b` spec file, `171d539` TODO.md). Confirmed RED for the right reason (19 failed/2 passed against prod, all "element not found"/`data-theme` unset — not broken selectors), and zero regression on the 5 pre-existing spec files (74/74 still green). `.project/TODO.md` QA-07/QA-08/QA-09 now `[x]`. Branch pushed to `origin/feature/light-dark-toggle`.

**Stage 2 — COMPLETE.** Frontend Engineer implemented DEV-05 (light theme CSS override block + new `--on-accent`/`--error`/`--error-text`/`--select-chevron` variables + hardcoded-hex fixes in `shared.css`) and DEV-06 (toggle button + synchronous head theme-init script + click handler on all 3 pages), commit `1f9b17d` on `feature/light-dark-toggle`. 95/95 tests passing locally (21 new + 74 pre-existing). Contrast independently re-verified against spec §5.4 (tightest margin 4.48:1, clears 3:1 UI-component minimum). PR **#17** opened against `main`: https://github.com/ericreilly999/website/pull/17. `.project/TODO.md` DEV-05/DEV-06 now `[x]`.

Documentation Agent updated `README.md` (dark-theme-only language was stale) on `feature/light-dark-toggle`, commit `be3fbd8`. No `docs/` directory exists in this repo; `docs/api/` not implicated. Flagged `CLAUDE.md`'s similar stale "shared dark-theme design system" line as a follow-up (out of Documentation Agent's `README.md`/`docs/` boundary — PM to action).

Code Reviewer reviewed PR #17 — **REQUEST CHANGES, not merged.** Implementation itself checked out clean (FOUC script synchronous in `<head>` on all 3 pages, `localStorage` failure fallback intact, all hardcoded-hex call sites now `var(...)`-driven, Tier 2 decisions matched). **Blocking finding:** no independent QA validation exists for this PR — only Frontend Engineer's self-reported "95/95 passing," no `test-signoff.md` entry, no QA PR comment. Every prior round (PR #11-#15) went through an independent QA re-validation pass between dev and merge; this round skipped it. Comment: https://github.com/ericreilly999/website/pull/17#issuecomment-5754269056

## Next Action
Stage 3 (retry): QA Engineer dispatched for independent validation pass (re-run all 95 tests against `feature/light-dark-toggle`, record `test-signoff.md` entry, comment pass count on PR #17) → re-invoke Code Reviewer for merge.

## Gate Status

| Gate | Round 2 (PR #11) | Round 3 (PR #12) | Round 4 (PR #13) | Round 5 (PR #14) | Round 6 (PR #15) |
|------|------|------|------|------|------|
| Stage 1 — Test writing | ✅ | ✅ | ✅ (commit `ddfbf29`) | ✅ (commit `ccdb092`) | ✅ (commits `d487e1b`/`6a02850`) |
| Stage 2 — Development | ✅ | ✅ | ✅ (implemented, 62/62 local) | ✅ (implemented, 73/73 local) | ✅ (implemented, 74/74 local) |
| Stage 3 — Code Review | ✅ (CR blocked once, resolved) | ✅ (clean first pass) | ✅ (clean first pass, merge `b99703f`) | ✅ (clean first pass, merge `f2266c7`) | ✅ (clean first pass, merge `270558e`) |
| Stage 4 — Deploy to Staging | ✅ (run 34702470524) | ✅ (run 34704340442) | ✅ (run 34718497465) | ✅ (run 34763041660) | ✅ (run 34795666261) |
| Stage 5 — QA Validation (staging) | ✅ (31/31) | ✅ (58/58) | ✅ (62/62) | ✅ (73/73) | ✅ (74/74) |
| Prod Deploy | ✅ `v0.1.6` | ✅ `v0.1.6` | ✅ `v0.1.6` | ✅ `v0.1.6` | ✅ `v0.1.7` |

## Known non-blocking follow-ups (not yet actioned)
- `.project/TODO.md` has no entries for any of the prose-refresh rounds — decided (PM, Tier 1) not to backfill formal TODO tracking for copy-only micro-rounds; noted here for traceability.
- No branch protection on `main` (pre-existing, unrelated risk) — several commits across rounds landed directly to `main` outside a PR (`test-signoff.md` sign-off entries), consistent with this repo's established precedent, but still worth the human's attention long-term.
- Recurring anti-pattern observed this session: a subagent (DevOps, monitoring staging deploys) twice armed a background poll and ended its turn instead of blocking synchronously, despite explicit ci-discipline instructions. Corrected in-session both times.

## Incident — 2026-09-12: uncommitted PM tracking-file edits (and pre-existing uncommitted narrative in decisions.md/deployment-log.md) lost to a shared-working-directory hard checkout

**What happened:** For Round 4, the Frontend Engineer subagent was dispatched without worktree isolation and ran a branch switch (reported as "checked out `content/prose-round-4`, reset to match `origin/content/prose-round-4`") directly in the shared primary working directory `C:\dev\gitrepos\website`. That operation discarded uncommitted, not-yet-shipped edits sitting in that working tree:
- This file (`workflow-state.md`) and `project-status.md` — PM's own in-progress updates covering Round 2/3 completion (never committed, since no downstream agent's task happened to `git add` them again after the initial PR #11 commit).
- `.project/decisions.md` and `.project/deployment-log.md` — uncommitted content that predated this entire session (visible in the very first git-status snapshot at session start, ~14 and ~80 added lines respectively per an early `git diff --stat`). Every agent that noticed these files as "modified" correctly treated them as out-of-scope and left them alone all session — which meant they sat uncommitted and vulnerable the whole time. Their actual content was never captured by any agent this session, so it could not be reconstructed after the reset. **This content is very likely permanently lost.**

`workflow-state.md` and `project-status.md` were reconstructed from the PM's own conversation context (the edits were made earlier in the same session and could be retyped from memory). `decisions.md` and `deployment-log.md` could not be recovered.

**Fix going forward:** Dispatch any agent that will run branch/checkout/reset operations (Frontend, Backend, QA doing implementation-adjacent git work) with `isolation: "worktree"` on the Agent tool call, so it operates on a separate git worktree instead of the shared primary working directory. The PM's own direct edits to files it owns should also be committed promptly rather than left to accumulate uncommitted across multiple agent dispatches into the same shared tree.

**Promoted to:** see `lessons-learned.md` entry same date — flagged directly to the human, no formal retro scheduled for this project.
