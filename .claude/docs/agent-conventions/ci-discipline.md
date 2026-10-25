# CI Minute Discipline

Applies to every agent that influences when a CI pipeline runs (PM, Code Reviewer, QA, SRE, DevOps).

GitHub Actions minutes are scarce. Each tag push / staging deploy typically burns ~20 minutes, and each project's budget is 300 minutes a month on private repos ([[autonomy-bar]] P-2; the 2,000 free account minutes were gone by 2026-10-07), so a few iteration cycles can blow it.

The engineering standards these rules feed are in `docs/standards/ci-cd.md` and `docs/standards/testing.md` (rule ids `CI-`, `TEST-`, `GHM-`).

## Background — why these rules exist

The canonical project-level incident (paraphrased from `CLAUDE.md` if present): a small bug took 18 consecutive failed tag pushes (~360 CI minutes) to diagnose. Every minute was preventable with local validation against the deployed environment. Local validation is the default; tag pushes are reserved for final confidence checks.

## Hard rules

1. **Never use a tag push as an iteration mechanism.** Tags are confidence checks, not debugging tools. If you want to test something, run it locally against the already-deployed environment first.

2. **Two-stage local validation before any tag push.** The validation suite must run successfully:
   - First against **dev** (using the project's gitignored dev env file)
   - Then against **staging** (using the project's gitignored staging env file)
   
   Only then tag a release — and only ONE tag. The project's `CLAUDE.md` documents the exact env-file names and the command used.

3. **Local harness is gospel.** If a harness file is broken or missing, fix the harness — do NOT tag-push around it.

4. **A failing CI cycle without a prior local-green is a process violation.** Surface to PM, do not push another tag.

   **Corollary — an open `deploy-failure` issue blocks new merges.** If the project has an auto-`deploy-failure`-issue backstop (a `notify-failure` job that opens/comments a labelled issue on a red deploy), any open `deploy-failure`-labelled issue MUST be triaged (SRE) **before merging anything new**. Consecutive failures on the same workflow are a STOP-and-diagnose signal, not a merge-around signal. Triage SLA: the issue is surfaced and owned within one session-open — it is a hard gate, not a soft one. A deploy-failure issue that sits while other work continues defeats the purpose of the backstop.

5. **On 403 rate-limit errors, do NOT retry** ([[github-api]] rule 4 is the rule).

   **Block on the wait — never arm a watcher and exit.** When an agent must wait for an external process (a CI run, a deploy, a background job) to reach a terminal state, it MUST **block** in the foreground until then. Do NOT arm a watcher (`Monitor`, a `run_in_background` poll loop, `ScheduleWakeup`) and end the turn — a watcher orphaned at agent exit forces a re-dispatch, which wastes context. Wait in **bounded foreground Bash calls**: one call lasts at most 8 minutes (set `timeout: 600000`; a Bash call is capped at 10), polls every 60–120 s through REST ([[github-api]]: `gh pr view` is GraphQL, blocked in cloud sessions), and stops early on a terminal state. If the call returns with the run still going, make the same call again, inside the same turn. Deploy/CI pipelines take 15–25 min, so expect three or four calls; past about 40 minutes, report the run as stuck to the PM instead of calling again.

   ```bash
   # one foreground Bash call (timeout: 600000): up to 6 polls x 75 s, about 7.5 min. Not terminal yet: run it again.
   for i in $(seq 6); do
     python .claude/scripts/lib/github.py status-poll --owner O --repo R --ref <sha> | grep -q '"terminal": true' && break
     sleep 75
   done
   ```

   Exiting the turn before the wait condition is terminal = re-dispatch = wasted context.

   This rule is also enforced at the **agent-definition level** (devops-engineer, qa-engineer, code-reviewer) because prompt-level reminders alone failed: the arm-a-watcher-and-exit anti-pattern recurred ~5× across sessions despite explicit per-dispatch guidance, including a deploy-remediation agent that armed a `Monitor` and ended its turn mid-apply, leaving a staging deploy in flight with no reported verdict. `Monitor`, `ScheduleWakeup` and `run_in_background` loops are forbidden for terminal-state waits by name; the repeated bounded foreground Bash call above is the only accepted mechanism.

6. **Pre-push validation includes linters CI runs, not just tests.** "Tests pass locally" is necessary but not sufficient — CI also runs project linters (`ruff` for Python, `eslint` + `tsc` for TypeScript, `terraform fmt` / `tflint` for HCL, etc.). The project's `CLAUDE.md` lists the exact linters. Run them all locally before push. A force-push to fix a lint error wastes a CI cycle the same way a tag-push iteration does.

7. **Tag only commits that produce a deployable artifact.** Path-filtered deploy workflows skip docs-only, test-only, and spec-only commits — those commits will never produce an image. Tagging one strands the downstream deploy pipeline waiting for an artifact that never arrives. Before tagging: verify the target commit touched paths that pass the deploy workflow's `paths:` filter, OR tag the most recent ancestor that did.

8. **Never merge a CI-running RED test suite to `main` ahead of its implementation.** On repos where the PR gate runs the full test suite, a RED suite merged to `main` turns the gate red for **every subsequent PR** until the implementation lands — a self-inflicted cascade that blocks unrelated work. When a TDD RED suite must merge before its impl, gate it so it doesn't fail the shared `main` gate: mark the not-yet-passing tests `xfail` / skip-until-implemented, guard them with a `skipif` on a feature flag, OR land the impl in the same merge window. The RED suite still serves its contract purpose locally and in its own PR; it just must not poison `main`'s gate. (Reference: a RED recon-endpoint suite blocked an unrelated PR until its impl merged; the prod-TF goldens avoided the same trap with a `skipif`-guard.)

## Two-stage local validation gate (HARD GATE)

Applies whenever QA runs the live E2E suite — pre-tag-push validation AND post-deploy validation (Stage 5 / Stage 7 in the PM workflow). The suite ALWAYS runs locally, pointed at the live environment URL. Never via the live-E2E CI workflow.

Before any tag push:
- **Stage A — Dev local validation:** QA runs the live suite locally against dev, reports green
- **Stage B — Staging local validation:** Same suite locally against staging, reports green
- **Pre-flight check:** If a project has a migration / schema script with a pre-flight ABORT on detected drift (test-data accumulation, stale rows, schema-mismatch), run that script as a probe in both Stage A and Stage B before declaring green. Fix violators with the project's documented cleanup pattern rather than tagging and waiting for the deploy to ABORT.
- **Only then**, within an hour of both greens, instruct DevOps to push the tag

Same rule applies after a deploy completes, when QA validates the deployment: run locally, never trigger the live-E2E CI workflow as a "test" — that's ~20 GH minutes per run and exists only as a final-confirmation safety net.

When a live-E2E run fails locally, debug it per [[live-e2e-cleanup-discipline]] — trace-first (the cause may be deployed-environment state, not code), and ensure every spec runs a stale-state sweep at start on no-auto-cancel environments.

## Trigger-path discipline

Dev deploy workflows that auto-trigger on `push: branches: [main]` (staging and prod start only from a dispatch or a gated release-request push, standard CI-01) MUST use `paths:` to filter triggers to paths that actually change the deployed artifact. Test-only changes (`tests/**`), spec changes (`.project/**`, `spec/**`), and docs (`*.md`, `docs/**`) MUST NOT trigger redeploys.

Audit any new `deploy-*.yml` workflow added later for this pattern. A `push: branches: [main]` trigger without a `paths:` filter is CI-minute waste.

**Path filters have a downstream consequence.** If a downstream-environment deploy workflow (e.g. staging) "promotes" an image built by an upstream workflow (e.g. dev), the downstream is implicitly coupled to the upstream's path filter. A tests-only or docs-only commit upstream produces no image; the downstream's promote-image step then polls for ~20 min and times out. Either:
- (a) downstream falls back to building its own image when upstream-ECR lookup misses,
- (b) downstream uses tag-based image lookup rather than HEAD-based, or
- (c) the upstream build job specifically skips the path filter (deploy job still filters).

Document the chosen pattern in the project's `CLAUDE.md`. The pre-tag-push check from Hard Rule 7 above also catches this case.

The project's `CLAUDE.md` lists the exact `paths:` patterns that apply.

## Surface-to-human discipline

Don't surface intermediate steps during a fix cycle; the two-stage local gate runs autonomously. A run P-2 covers is logged, not asked. A run it does not cover (over 15 minutes, over budget, a perf or full-regression run, a prod apply outside P-7 or P-10, a release-candidate tag) is one decision card with the minutes in `cost`.

## Pipeline-only path to staging and prod (owner decision FL-6, 2026-09-23)

The deploy pipeline (GitHub Actions: plan-on-PR, apply-on-merge, image/asset promotion, post-deploy smoke) is the **only** path by which code or infrastructure reaches staging or prod. Workstation `terraform apply` / `aws` CLI changes remain allowed for **dev only**, and every such change is still logged in `.project/deployment-log.md`. Incident remediation in staging/prod goes through the project's documented break-glass path, never an ad-hoc workstation apply (git-guard.js blocks a workstation prod apply). Rationale: the 2026-09-23 fleet survey found most real changes in drinkupapp and odds-analysis bypassed pipelines that already existed; GenCast staging/prod are built pipeline-first from day one.

## Actions runs: P-2 budget (owner rule 2026-10-20, replaces the 2026-09-23 and 2026-10-09 per-run approvals)

Running suites locally (unit, integration, Playwright against dev) stays the default habit at every step; it costs no minutes. Actions is not an iteration loop: never push commits just to see CI.

- **Covered by P-2, no ask:** exactly the runs [[autonomy-bar]] P-2 lists (standard GHM-01); that definition is the one copy. Log each run as an auto item ([[autonomy-bar]]) with its minutes and the month's running total, read from `~/.claude/fleet/cost-scan.json`.
- **Still Tier 3:** everything P-2 does not cover: a run over 15 minutes, any run that would take the project past its budget, any perf or full-regression run, prod applies outside P-7 or P-10, and release-candidate tags.
- **Perf and full regression** (standard GHM-02). k6 / Lighthouse runs and full regression suites (for example GenCast's Reskin Contracts suite) run locally in every release certification. An Actions run of one needs owner sanction whatever its length; their workflows stay `workflow_dispatch` only; k6 is capped at 4 runs or 80 minutes per repo per month. Background: in October 2026 the Reskin suite ran on every PR and used 1,952 of the 2,000 free minutes in seven days.
- **Workflow triggers** follow standard CI-01: `workflow_dispatch` or `workflow_call`, a path-gated `pull_request` check (an unfiltered one only with an owner-decision waiver, `# standards-waive: CI-01 WS-3` on website, which the reviewer verifies; never `pull_request_target`), a path-filtered `push` to main for a dev deploy, a `plan/**` push for a plan-only workflow (GC-200), or the release-request pipeline's `release/<env>/*` and `test/dev/*` pushes with the gate in the job (FL-19 B, FL-20 B, [[cloud-releases]]); staging and prod deploys start only from a dispatch or a gated release-request push; never an unfiltered `on: push` / `on: pull_request` or `schedule`. Existing path-gated PR checks (odds-analysis, website, drinkupapp) stay as they are.
