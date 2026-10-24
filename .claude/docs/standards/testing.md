# Testing and GitHub minutes standards

Tests first, live tests, and what GitHub Actions minutes may be spent on. Read with [tdd-workflow](../agent-conventions/tdd-workflow.md), [ci-discipline](../agent-conventions/ci-discipline.md), [live-e2e-cleanup-discipline](../agent-conventions/live-e2e-cleanup-discipline.md) and the QA rules in [qa-engineer](../../agents/qa-engineer.md). Rule format and waivers: [README](README.md).

## Testing

### TEST-01 · Tests come first

QA MUST write and commit RED tests from the spec before implementation starts, and an engineer dispatch MUST carry a `red_confirmed` ledger line for its task or a `no-red:` token; an XS task may skip QA-first with one reviewer pass.

- **Why:** tests written after the code test the code, not the spec (FL-12, 2026-09-26, XS fast path; [tdd-workflow](../agent-conventions/tdd-workflow.md)).
- **Reference:** GenCast `.project/TODO.md` (QA RED row before each DEV row); strict-xfail tests pin an invariant first.
- **Enforced by:** `agent-dispatch-gate.js` (`tdd_no_red`); `scripts/checks/tests-first.js` before merge.

### TEST-02 · Tests are never weakened to pass

A change MUST NOT delete or loosen an assertion, add a skip, retry or longer timeout to get green, or add a testid, flag or hook whose only purpose is to let an old test pass.

- **Why:** a weakened test hides the defect it was written to catch (existing convention: `docs/agent-conventions/tdd-workflow.md` Hard rules; `agents/code-reviewer.md` gate 2).
- **Reference:** [code-reviewer](../../agents/code-reviewer.md) gate 2.
- **Enforced by:** review (BLOCKING).

### TEST-03 · Local suites run first

Every suite MUST run locally first (dev, then staging, both green) before a tag push or an Actions run, and a broken local harness is fixed, never routed around through CI.

- **Why:** local runs cost no minutes and find the same failures (FL-6 owner note, 2026-09-23; owner rule 2026-10-09; [ci-discipline](../agent-conventions/ci-discipline.md) Hard rules 2-3).
- **Reference:** GenCast `docs/runbooks/release-certification-checklist.md`.
- **Enforced by:** `git-guard.js` (`tag_push_unapproved`) for tags; review for the rest.

### TEST-04 · A RED suite never breaks main's gate

A RED suite that the PR gate runs MUST NOT merge to `main` ahead of its implementation unless its not-yet-passing tests are marked xfail or skip-until-implemented, guarded by a `skipif` on a feature flag, or the implementation lands in the same merge window.

- **Why:** a RED suite on main turns every later PR red (existing convention: `docs/agent-conventions/ci-discipline.md` Hard rule 8).
- **Reference:** [ci-discipline](../agent-conventions/ci-discipline.md) Hard rule 8.
- **Enforced by:** review.

### TEST-05 · Live tests use real auth and clean up

Live and E2E tests MUST run against dev or staging only, with real auth, no first-party mocks, QA-owned run-tagged accounts, and cleanup of everything they create; a leak is a backlog bug.

- **Why:** leaked test data broke later runs and polluted staging (QA RULE-1 to RULE-8 in [qa-engineer](../../agents/qa-engineer.md); gencast D-305, D-309, D-334; drinkupapp D-030, D-045).
- **Reference:** GenCast e2e cleanup helper and its lint (T-930), `devOnly()` guards, `qa-*` account names; [live-e2e-cleanup-discipline](../agent-conventions/live-e2e-cleanup-discipline.md).
- **Enforced by:** review.

### TEST-06 · Performance tests never touch prod

Load and performance tests MUST run against staging (dry runs in dev), NEVER production, and never with real PII or payments.

- **Why:** a load test against prod is an outage ([performance-engineer](../../agents/performance-engineer.md); drinkupapp D-051).
- **Reference:** [performance-engineer](../../agents/performance-engineer.md).
- **Enforced by:** review.

### TEST-07 · Fix PRs sweep for siblings

A fix PR MUST search for the same defect elsewhere and list the search and every hit in a `## Sibling sweep` section.

- **Why:** the same shape recurred across environments and modules (existing convention: `docs/agent-conventions/tdd-workflow.md` Fix PRs, which holds the section format).
- **Reference:** GenCast D-363 to D-380 sibling sweeps.
- **Enforced by:** `scripts/checks/sibling-sweep.js`.

### TEST-08 · Done needs the verifier's PASS

A user-facing or deployable PR MUST NOT be called done until the verifier's record `.project/verification/<PR>.md` shows `result: PASS` for the merge commit; the verifier is never the author.

- **Why:** self-verification passed broken screens (existing convention: `docs/agent-conventions/sprint-cadence.md` Definition of Done; `docs/agent-conventions/verification-checks.md` sign-off record; `agents/verifier.md`).
- **Reference:** `agents/verifier.md`; GenCast `.project/test-signoff.md` per cycle.
- **Enforced by:** `scripts/checks/signoff-read.js`.

## GitHub Actions minutes

### GHM-01 · Runs P-2 covers need no ask

An Actions run MAY go without asking only when [autonomy-bar](../agent-conventions/autonomy-bar.md) P-2 covers it (its run and monthly minute limits are the one definition); anything else is Tier 3.

- **Why:** the free 2,000 minutes were gone by 2026-10-07 (P-2, owner 2026-10-20; [autonomy-bar](../agent-conventions/autonomy-bar.md) P-2).
- **Reference:** each run logged as an auto item with its minutes and the month's total from `~/.claude/fleet/cost-scan.json`.
- **Enforced by:** review; `fleet/scripts/cost-scan.js` flags a project past its budget.

### GHM-02 · Perf and full regression need sanction

Perf (k6, Lighthouse) and full-regression suites MUST run locally in every release certification; any Actions run of one needs owner sanction whatever its length, and their workflows stay `workflow_dispatch` only (k6: at most 4 runs or 80 minutes per repo per month).

- **Why:** the Reskin Contracts suite ran on every PR and used 1,952 of 2,000 minutes in seven days (owner 2026-10-09; P-2; gencast D-346; platform ADR-0008, PL-26).
- **Reference:** GenCast `reskin-contracts.yml` (dispatch-only); `docs/runbooks/release-certification-checklist.md`.
- **Enforced by:** `standards-check CI-01` (dispatch-only); review for the sanction.

### GHM-03 · An automatic trigger states its budget

Any approval of an automatic CI trigger MUST state a monthly minute budget and a run-count cap, and usage MUST be checked weekly.

- **Why:** GC-58's PR suite ran 110 times at 18 minutes each before anyone looked (owner 2026-10-07).
- **Reference:** gencast D-386, D-391 cost lines.
- **Enforced by:** review; the weekly improvement routine reads the cost scan.

### GHM-04 · Never push to see CI

Commits MUST NOT be pushed only to see what CI says.

- **Why:** CI is the confirmation, not the debugger (existing convention: `docs/agent-conventions/ci-discipline.md` Actions runs).
- **Reference:** [ci-discipline](../agent-conventions/ci-discipline.md) Actions runs.
- **Enforced by:** review.

### GHM-05 · Hosted-runner Terraform is capped

Terraform runs on GitHub-hosted runners MUST use two jobs per environment (plan, apply) under per-repo monthly minute caps and a $10 per month Actions budget that stops at the limit; a self-hosted runner is cost-assessed first, and its spec (Q-38/PL-61) MUST keep pull-request-triggered jobs off it, because a self-hosted runner can carry credentials (an instance profile) that no workflow text shows.

- **Why:** apply jobs are the fleet's largest recurring minute line (owner PL-38, 2026-10-10; Q-38, 2026-10-24; platform ADR-0008, D-099).
- **Reference:** platform `scripts/tf-standards/minutes_guard.py`.
- **Enforced by:** review.

## Proposed (needs owner)

- **Quarantine a failing acceptance case only for one named SHA**, test-side, owner-rowed, never carried forward. GenCast D-334, D-345, D-348, D-355.
- **One re-run is the only flake allowance**, named in the decision; fixed waits become polls. GenCast D-305, D-318, D-484.
- **A change to a pinned invariant's input re-derives its dependents in the same change.** GenCast D-398 PP-FR-02.
- **Re-check a QA cleanup path against the environment role whenever access is narrowed.** GenCast D-306, D-309.
- **Terraform tests are plan-only and provably offline**, run only through runners that force a neutral AWS environment. Platform D-088.
- **Superseded assertions are rewritten as value pins and unaffected regions masked in byte-identity tests.** fleet-console D-075, D-080.
- **A sign or direction rule is tested through the real pipeline conversion module.** odds-analysis T-48.
- **Test-support endpoints are mounted in staging only, behind four gates.** drinkupapp D-039, D-040.
- **Paid QA runs are admitted as a fixed-dollar ticket with one total cap across attempts.** GenCast D-306, D-327.
