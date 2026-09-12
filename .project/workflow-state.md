---
# Workflow State

## Route-to-Live
**Standard** — `main → staging (auto) → prod (tag)`

Push to `main` auto-deploys to `staging.ericreilly.com` (and `staging.prompted.ericreilly.com`) and runs the Playwright E2E gate against staging. A semver tag push (`vX.Y.Z`) deploys to production (`ericreilly.com` and `prompted.ericreilly.com`).

## Current Stage
**Round 4 in review — Rounds 2 & 3 live on staging, awaiting human review**

Prior content-refresh story (rewrite + portfolio overhaul + human-directed follow-up) shipped to prod as `v0.1.5`. Three further rounds of copy edits were requested 2026-09-12:
- **Round 2** (PR #11, `9c76ac1`) — bio lede/paragraph, highlights list, skills grid. Merged, deployed to staging, QA-signed-off.
- **Round 3** (PR #12, `6538352`) — hero tagline shortened, 3 highlight bullets reworded. Merged, deployed to staging, QA-signed-off.
- **Round 4** (PR #13, `9a4febf` on branch `content/prose-round-4`) — hero sub-paragraph reworded (drops "Togetherwork"/"AI-native"), bio opener reworded, banking bullet reworded ("Appointed platform owner for..."), delivery & leadership skills cell reworded, tagline "i"→"I" capitalized. **PR open, not yet reviewed/merged.**

No prod tag requested for any round — production still reflects `v0.1.5`.

## Last Gate Cleared (prior prod story)
Prod Deploy — human explicitly approved ("ship the changes to prod"). Tagged and pushed `v0.1.5` from `main` tip `afac3632`.
- Workflow run [34302193693](https://github.com/ericreilly999/website/actions/runs/34302193693): `deploy-prod` ✅ `deploy-prompted-prod` ✅.
- Live production verified twice. No discrepancies.

## Active Route

**Round 2 (PR #11) — COMPLETE through Stage 5.** QA wrote/updated assertions → Frontend implemented → Docs (no impact) → Code Reviewer blocked once (missing independent QA re-validation) → QA independent pass (31/31) → Code Reviewer merged (`9c76ac1`) → staging deploy green (run 34702470524) → QA staging sign-off (31/31, `test-signoff.md` commit `92f2458`).

**Round 3 (PR #12) — COMPLETE through Stage 5.** QA wrote/updated assertions (`homepage.spec.js`, `about.spec.js`) → Frontend implemented → QA independent pass (58/58, built in proactively) → Docs (no impact) → Code Reviewer merged clean (`6538352`) → staging deploy green (run [34704340442](https://github.com/ericreilly999/website/actions/runs/34704340442)) → QA staging sign-off (58/58, `test-signoff.md` commit `cd03314`).

**Round 4 (PR #13) — Stage 1-3 in progress.**
```
[x] QA locates strings, writes/updates assertions (5 checks, commit ddfbf29) — confirmed 5 red/57 green
  → [x] Frontend implements 5 copy edits (uncommitted → committed by QA)
  → [x] QA independent validation (62/62 green, commit 9a4febf) → PR #13 opened
  → [ ] Documentation Agent (doc-impact check)
  → [ ] Code Reviewer → merge to main
  → [ ] Auto-deploy to staging → [ ] QA validates staging locally
  → [ ] Report to human — no prod tag requested this round
```

## Next Action
Invoke Documentation Agent on PR #13, then Code Reviewer.

## Gate Status

| Gate | Round 2 (PR #11) | Round 3 (PR #12) | Round 4 (PR #13) |
|------|------|------|------|
| Stage 1 — Test writing | ✅ | ✅ | ✅ (commit `ddfbf29`) |
| Stage 2 — Development | ✅ | ✅ | ✅ (implemented, 62/62 local) |
| Stage 3 — Code Review | ✅ (CR blocked once, resolved) | ✅ (clean first pass) | ⏳ Docs check pending, then CR |
| Stage 4 — Deploy to Staging | ✅ (run 34702470524) | ✅ (run 34704340442) | ⏳ pending merge |
| Stage 5 — QA Validation (staging) | ✅ (31/31) | ✅ (58/58) | ⏳ pending deploy |
| Prod Deploy | Not requested | Not requested | Not requested |

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
