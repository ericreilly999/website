# TDD Workflow

Applies to every engineering agent (Frontend, Backend, Application, Data).

Tests exist before any code is written. The engineer's job is to read the tests and make them pass. Defer to [[autonomy-bar]] for what to decide on your own vs. what to surface. Linear-tracked projects still work from `.project/TODO.md`; Linear holds only epic status ([[linear]]).

## Pre-flight checklist

1. The QA test-writing task is `[x]` in `.project/TODO.md` and `.project/ledger.jsonl` has a `red_confirmed` line for the task (QA ran the tests and they failed for the right reason), or the dispatch carries a `no-red:<infra|docs|refactor-covered|config|xs>` token. If not — stop, surface to PM.
2. Your task's `Depends On` entries are all `[x]`.
3. You have read the spec section and its AC ids.
4. You have read QA's tests — they are your contract.

## Workflow

1. **Decide or ask.** Default is decide. Ask the PM only when interpretations differ materially on **cost, security, or scope** (Tier 3); otherwise pick the one that fits the spec and tests and flag it.
2. **Mark in-progress:** `[ ]` → `[~]`.
3. **Implement** the minimum code that makes the tests pass. QA's test commit comes first on the branch; `tests-first.js` fails a PR whose implementation lands before its tests.
4. **Self-review.** All tests pass locally. Every AC met. No unspecified behavior. Project `CLAUDE.md` conventions followed. Every new `try/except` emits or re-raises ([[error-handling-discipline]]).
5. **Deliver** to PM: what was built, assumptions flagged, follow-ups noticed but not implemented.
6. **Mark complete:** `[~]` → `[x]` (dev-complete, not done).
7. **Verifier.** A user-facing or deployable PR is done only after the `verifier` agent, dispatched after merge with just the PR number, AC ids and staging URL, records `result: PASS` for the merge commit in `.project/verification/<PR>.md`. You never verify your own work.

## Fix PRs: fix the class, not the instance

Before fixing a defect, search for its siblings: the same pattern, the same copied logic, the same missing guard elsewhere (`rg` across the repo, all environments' config, both frontend and backend). Fix every sibling or say why it is not affected. The PR body has a `## Sibling sweep` section holding either the search command in a code span or block (`rg`, `grep`, `git grep`, ...) followed by its results (`file:line` hits, each fixed or ruled out with a reason, a hit count, or `no matches`), or `no siblings: <reason>` with a reason of at least 10 characters. `sibling-sweep.js` checks exactly this, and the reviewer blocks without it.

## Hard rules

- You never write tests, except the single regression test on an XS task (PM skill XS path). Behavior that needs a test but has none goes to the PM.
- You never change a test, or add a testid, flag or compatibility hook, so an old test passes against new behavior. If a test is wrong, QA changes it against the spec.
- You never add untested behavior.
- You modify no project artifact other than `.project/TODO.md` (status column) and `lessons-learned.md` (append-only, [[lessons-learned]]).

## Cross-environment work

When a task touches more than one environment, order the decomposition by **deploy gate**, not writing order, and name each PR's gate ("dev surface live after merge", "prod dormant until promotion"). A task whose AC assume every env is live either splits into one PR per env, sequenced by gate, or states the asymmetry so QA validates the live surface now and the dormant one after its gate fires.

## Clarification protocol

When you do need to clarify (Tier 3), batch the questions in one round, each with its two options and their material difference. If the options don't differ on cost, security or scope, decide instead and flag: "Implemented X. Assumption: chose Y over Z because [reason]. Revert if wrong." If the human corrects the bar ("you should have asked" / "you didn't need to ask"), append a `lessons-learned.md` entry.
