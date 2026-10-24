# Fleet engineering standards

A standard is a decided engineering pattern that every fleet project follows: how pipelines run, how Terraform holds state, how agents reach AWS, where secrets live, how tests and Actions minutes are spent, and how cloud sessions behave. The owner approved this set on 2026-10-24: agreed patterns are written down here, enforced by a check where one can be, and promoted weekly by the improvement routine.

A standard is not a project choice. Product rules, prices, copy and anything one project decided for itself stay in that project's `.project/decisions.md` and ADRs.

## Files

| File | Ids | Covers |
|---|---|---|
| [ci-cd.md](ci-cd.md) | `CI-` | workflow triggers, job limits, deploy gates, promotion, tags |
| [iac.md](iac.md) | `IAC-` | Terraform state, roots, destroy protection, billing tripwires |
| [aws-access.md](aws-access.md) | `AWS-` | accounts, OIDC, cloud users, key rotation, the root-key lane |
| [secrets.md](secrets.md) | `SEC-` | where secrets may and may not go |
| [testing.md](testing.md) | `TEST-`, `GHM-` | tests first, live E2E, GitHub Actions minutes |
| [cloud-sessions.md](cloud-sessions.md) | `CLOUD-` | per-project routines, merges, network allowlist |

There is no `review-merge.md`: the review and merge rules already live in `agents/code-reviewer.md`, `docs/agent-conventions/verification-checks.md` and `docs/agent-conventions/hooks.md` (merge gate). Behavioural conventions (autonomy tiers, decision cards, the page, Linear) stay in `docs/agent-conventions/`; a standard links to them and never copies them.

## Rule format

Each rule has an id, one sentence that says MUST or NEVER, and three lines:

- **Why:** one line, ending with the decision it rests on: an owner decision id such as `FL-6`, a policy such as `P-2`, a project ADR such as `gencast ADR-015 §7.3`, or an **existing convention**, meaning a claude-repo convention already merged by PR (P-8), cited as `existing convention: <file path> <section>`. A rule stricter than the convention it cites is not a rule until a decision backs it; it goes under Proposed.
- **Reference:** where it is implemented, with GenCast's workflow or script path as the reference version when GenCast has one.
- **Enforced by:** `standards-check <ID>` (the static check in `scripts/checks/standards-check.js`), a hook (`git-guard.js`, `agent-dispatch-gate.js`), another check script, or `review` (the code-reviewer and devops-engineer read the rule; nothing mechanical checks it).

Ids are stable. A retired rule keeps its id with `Retired <date>: <reason>` and the id is never reused.

Each file ends with **Proposed (needs owner)**: patterns one project uses with no owner or ADR decision behind them, or a decision that is still pending. They are not rules, nobody blocks on them, and they become rules only through the promotion process below.

## How reviews cite them

The `devops-engineer` and the `code-reviewer` read the matching file whenever a PR touches `.github/workflows/**`, `**/*.tf`, `**/*.tfvars` or deploy scripts (`scripts/deploy/**`, `scripts/promote/**`, `**/deploy*.sh`). A finding against a rule starts with the rule id:

```
**[BLOCKING]** — CI/CD · CI-02

**Finding**: job `deploy` has no `timeout-minutes`.
```

A violated rule whose enforcement is `standards-check` or a hook is BLOCKING. A `review` rule is BLOCKING unless the rule says WARN. A Proposed item is at most a SUGGESTION.

## The check

`node scripts/checks/standards-check.js --repo <path>` checks the rules marked `standards-check` statically and prints `{repo, checked_at, results: [{id, status, evidence}]}` (status `pass`, `fail`, `waived`, `warn` or `n/a`) plus a one-line summary; it exits 1 on any `fail`. A project session runs it at open (`skills/project-session/SKILL.md` step 4a) and the weekly improvement routine runs it for every project at `origin/main` (`--ref origin/main`). `--format summary` prints only the one line.

A file may waive a rule with a comment line naming the owner decision that allows the exception, for example `# standards-waive: SEC-02 D-130` in a `.tf` file or `# standards-waive: CI-01 WS-3` in a workflow. The check reads waivers from the raw text without parsing YAML or HCL: any line whose first non-space character is `#` counts, wherever it sits (inside a `run: |` block or a multi-line quoted value too), and so does ` # standards-waive:` after other text on a line; only text with no `#` before it (`echo "standards-waive: CI-01 WS-3"`) waives nothing. So the code reviewer MUST confirm that every waiver sits on its own comment line of the file, not inside a script, a string or a trailing comment, and treats one that does not as BLOCKING. The decision id must not be a standards rule id. The check then reports `waived` with the decision id (`waived_by`) and the evidence, never `pass`, and the top-level status is `waived` when nothing fails. A waiver with no valid decision id is itself a `fail`.

A waiver is scoped to the finding kinds its rule allows. CI-01's covers only the unfiltered `pull_request` check (the WS-3 case); every other CI-01 finding (an unfiltered `push`, a `schedule`, a push on a staging or prod deploy, a `plan/**` apply, a pull-request-reachable trigger that uses secrets, `pull_request_target`) still fails in a waived file. For the other rules, a waiver covers that rule's findings (fails and warns) in that file. A workflow the check cannot read is never waivable, and it fails every workflow rule (CI-01 to CI-04 and AWS-02), so a waiver can never hide the rules it could not run. The code reviewer verifies every waived result: the decision exists in the project's `.project/decisions.md`, its ADRs or the Fleet Decisions page, and the file is still what the decision approved; an unverifiable waiver is BLOCKING.

## Promotion

1. **Find.** Each week the improvement routine (`skills/fleet-improve/SKILL.md`, Promote) reads every attached project's new `.project/decisions.md` entries and ADRs since the last weekly issue and flags any that set a reusable pattern or contradict a standard.
2. **Decide.** A pattern becomes a rule only when an owner decision or an ADR stands behind it. A pattern without one goes under Proposed with the project and source that use it. Proposed moves to a rule when the owner decides it (a decision card) or a project accepts it in an ADR.
3. **Change by PR.** A standard changes only by a reviewed PR to this repo, never by editing a vendored copy. A standards PR that adds or amends a rule counts toward the routine's cap of 3 PRs a week. A rule that needs a new check names the check id, and the PR that adds the check updates `Enforced by`.
4. **Contradictions.** When a later owner rule contradicts a standard, the later rule wins and the standard is amended in the next PR. When nothing settles it, the routine lists it in its report under **Waiting on the owner** and leaves the rule unchanged.
