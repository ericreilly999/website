# Cloud releases (release-request branches)

Owner decisions on the Fleet Decisions page, 2026-10-24. **FL-19 B:** agents run the pipeline setup ("We need these patterns established so our cloud sessions can move seamlessly"). **FL-20 B:** a staging deploy goes ahead without owner approval once the dev integration suite has passed against dev at the same commit, all changes included; prod still needs an approved card naming the commit and the plan's change hash.

A cloud session can push a branch but cannot dispatch a workflow. So every pipeline run starts from a branch the session pushes:

- `release/<dev|staging|prod>/<sha>` starts a release run (plan or apply) of `<sha>`;
- `test/dev/<sha>` starts the dev integration suite against dev at `<sha>`.

The contract is platform's spec `spec/pl1-fleet-agent-access.md` v1.5.0 (FA-FR-72 to FA-FR-77, FJ14, FJ15, FJ31 to FJ35, S-31 to S-40; T-490 RC-1 to RC-7) and its templates `templates/workflows/`, released as `tools/pipeline/v1.0.0` (ericreilly999/platform PRs #234 to #238, commit `634bd22`). Since v1.5.0 the release job reads no role variable: the gate takes the account id and the plan, spoke, apply and deploy role ARNs of each environment from `.github/pipeline-config.json` on `main`, and the job checks `aws sts get-caller-identity` against that account before `terraform init` (`account-mismatch`). Changing a role therefore needs a commit to `main`, never a repository variable. `standards-check` CI-01 compares a repo's copies with that tag's text ([CI-01](../standards/ci-cd.md); reference in `scripts/checks/lib/platform-templates/`). The exact commands and one row per gate code are in platform's `docs/runbooks/pipeline-release-requests.md`, which adopting repos read in place. This page is the session's side: what it checks before each push, how it waits, and what stays a local task. Standard: [CI-01, CI-04 and CI-05](../standards/ci-cd.md).

## Who does what

- The **PM** decides what to release, verifies every approval itself (agent rule 2: `answer.decided_by_owner === true`, cite the id and `decided_at`), and writes the prod card.
- The **DevOps engineer** (dispatched with `isolation: worktree`) makes the request commits, pushes them, waits for the runs, runs release smoke and writes `.project/deployment-log.md`.
- **QA** fills in the project's dev integration suite (the `suite` job of `.github/workflows/dev-integration-suite.yml`; its first test asserts that dev serves `<sha>`). The `guard` job is platform's text and is never edited.

## Before any push

1. The repo has adopted the pipeline: `.github/workflows/terraform-release.yml`, `terraform-pipeline.yml` and `dev-integration-suite.yml` copied byte for byte at `tools/pipeline/v1.0.0` (only `__REPOSITORY__` and the suite's `suite` job differ), and `.github/pipeline-config.json` on `main` with every environment's `account_id`, role ARNs and `roots` filled in (a `__PLACEHOLDER__` left in gives `bad-input`). A repo that has not adopted it still releases by dispatch, which the cloud cannot start (below).
2. `<sha>` is the full 40-character commit, on `main`: `git fetch origin`, then `git merge-base --is-ancestor <sha> origin/main` exits 0. Never a feature commit.
3. The root exists at `<sha>`: `git ls-tree -d <sha> <root>` prints it, and it matches `root_pattern` in the config.
4. At most one release request is pending per repo (S-32): `gh run list --workflow terraform-release.yml --status in_progress --json databaseId` is empty.
5. The run fits P-2: each run is at most 15 minutes and the job itself refuses once the month's 300 minutes are used (`minutes-cap`, S-39). Never start a run to test a change.

## Make the request commit, then push it

The request commit is an empty commit on `<sha>` whose subject and trailers carry the request (exact text in the runbook):

```
git worktree add --detach .claude/worktrees/release-<sha8> <sha>
git -C .claude/worktrees/release-<sha8> commit --allow-empty -m "release: <env> <mode> <root> <sha>" -m "Release-Root: <root>
Release-Mode: <apply|plan>"
git -C .claude/worktrees/release-<sha8> push origin HEAD:refs/heads/release/<env>/<sha>
```

Each of these is its own Bash call: `git-guard.js` checks a push before any of its call runs, so a commit and a push in one call block (`push_chained`). Work in a worktree, never the session's checkout (CLOUD-08). To request again (S-31, S-32), make a new request commit there and push it: a plain push once the run's cleanup job has deleted the branch, or `git push --force` while the branch still exists (a forced update is not a delete; the 2026-10-25 probe did not try one, so a 403 on it is reported like a refused push). Remove the worktree when the release is done.

## Dev (FJ14)

1. Checks 1 to 5 above.
2. Request commit `release: dev apply <root> <sha>` (no card, no hash), push `release/dev/<sha>`.
3. Wait for the run, then run release smoke against dev ([[verification-checks]]) and log the deploy.

## Dev integration suite (FJ31)

1. The dev release of `<sha>` (the root you will promote) concluded `success`, and it is the latest dev release run of that root at `<sha>`.
2. Push the release commit itself: `git push origin <sha>:refs/heads/test/dev/<sha>`. No request commit; the guard refuses any other commit under that name (`suite-gate: bad-ref`).
3. Wait up to 15 minutes for the suite run (`gh run list --workflow dev-integration-suite.yml --branch test/dev/<sha>`). Its conclusion is what the staging gate reads.
4. A failure that looks like a flake gets one re-run (S-34): push `test/dev/<sha>` again once the run's own cleanup job has deleted the branch (below); a push that leaves an existing branch's head unchanged starts nothing. In a repo whose suite has no cleanup job yet, the branch is still there and the session cannot delete it, so try `gh api -X POST repos/<owner>/<repo>/actions/runs/<run id>/rerun` (untested through the proxy; `run_started_at` resets on a re-run, so the staging gate counts it), and if that is refused, skip the re-run. A second failure stops: the PM opens a fix row and the fix is a new `<sha>`.

## Staging (FJ32; FL-20 B, no card)

1. Checks 1 to 5 above.
2. The evidence the job will read is there: the latest dev apply at `<sha>` of the dev root this staging root promotes from (`promotes_from` in the config; with one root per environment that is the dev root, not the staging root) succeeded, and the latest suite run on `test/dev/<sha>` concluded `success`, started after that dev release finished, and finished less than 168 hours ago. If not, run the dev release or the suite first (S-33, S-35); the job would refuse anyway (`no-dev-release`, `no-suite-run`, `suite-before-dev-release`, `suite-stale`).
3. Request commit `release: staging apply <root> <sha>` with no card and no hash, push `release/staging/<sha>`. No owner card for any change class (FL-20 B, "all changes included"); the autonomy bar still applies to merging the change, so a Tier 3 change was approved before it reached `main`. A repo whose config lists no `dev` (website-infra) has no suite, and its staging apply keeps the prod rule below.
4. Wait for the run, run release smoke against staging, log the deploy, then Stage 5 (QA on staging, the verifier) as usual.

## Prod (FJ35, then FJ15; post-LIVE only)

1. **Plan for the card.** After the soak window ([[sprint-cadence]]), with the staging release of `<sha>` concluded `success`: request commit `release: prod plan <root> <sha>` (no card, no hash), push `release/prod/<sha>`. A prod plan request needs no approval id. The run's job summary gives the change summary and the change hash. If the session cannot read the hash (the job summary is on the run page, not in the log), stop and report it to the PM; never compute or guess one.
2. **The card.** The PM writes a `do` card (Tier 3, [[decision-card]]) naming the repo, the root, `prod`, `<sha>` and the change hash, with the change summary, the soak tier and the sign-off records (`signoff-read.js <project> <PR> --sha <sha>` exits 0 for every PR merged since the last prod release). A P-7 or P-10 auto item is not a card here: FL-20 B keeps the approved card for every prod apply.
3. **Before the apply push** (FA-FR-75, agent rule 2): read the card with `ArtifactData` and go on only if `answer.decided_by_owner === true` and the card names this repo, this root, `prod`, this `<sha>` and this hash. A card that is pending, declined or has no `decided_by_owner` field: push nothing, report the card id and what you found to the PM, and never use another card. Any field that differs: push nothing and report the difference.
4. **The apply.** Request commit `release: prod apply <root> <sha>` with `Release-Card: <card id>` and `Release-Change-Hash: <hash>`, pushed with the card id in the command's own environment:

   ```
   FLEET_PROD_RELEASE_APPROVED=<card id> git -C .claude/worktrees/release-<sha8> push origin HEAD:refs/heads/release/prod/<sha>
   ```

   `git-guard.js` blocks a `release/prod/*` push without that prefix, or one whose id differs from the commit's `Release-Card` (`prod_release_unapproved`; the same rule holds for a `gh api` write to `git/refs`, and an MCP branch or file write to `release/prod/*` always blocks); an `export` earlier in the session does not count. The job re-plans, refuses an anchor address, and refuses before `terraform apply` when the fresh hash differs (`hash-mismatch`, S-36: a new prod plan and a new card, never the old one).
5. Release smoke against prod, the 10-minute alarm watch, and the deployment-log entry with the card id and its `decided_at`.

## Wait, read, and react

- Block in the foreground until the run is terminal ([[ci-discipline]] Hard rule 5): repeated `gh run list --workflow <file> --branch <branch> --json databaseId,status,conclusion,displayTitle,createdAt` calls of at most 8 minutes each. A run is created within 5 minutes of its push; none within 10 minutes is S-31.
- A refusal prints one line, `release-gate: <code>: <detail>` or `suite-gate: <code>: <detail>` (`gh run view <run id> --log-failed`). Do the action in that code's row of the runbook. Never fall back to a dispatch or a workstation apply, and never edit `authorized_actors` from a session.
- `release-gate: anchor` (the plan changes a pipeline or platform role) and a failed apply that may hold the state lock (S-38) go to the PM for the owner lane. They are not retried and not made local tasks.
- `release-gate: bad-input` (a config placeholder, an ARN in the wrong account, an unreadable run list), `account-mismatch` (the assumed credentials are in another account than the config names) and `root-env` (the root is not one of this environment's roots in the config) stop the release: report the line to the PM and do not re-push. A fix is a commit to `main` (the config) by the PM, never a session edit.

## Record and clean up

- Every run gets a `.project/deployment-log.md` line at the time it ran: environment, root, mode, `<sha>`, the request commit, the run id, the change hash, the suite run id (staging) or the card id and `decided_at` (prod), and the release smoke result.
- **A cloud session never deletes a branch.** The proxy refuses it: `git push --delete` gets HTTP 403, and `gh api -X DELETE repos/<owner>/<repo>/git/refs/heads/<branch>` gets "Write access to this GitHub API path is not permitted through this proxy" (fleet-console probe, 2026-10-25T02:06Z). So the cleanup belongs to the workflow. Once platform's spec and templates carry it (a spec change: FA-FR-76 and AC-76-2 now say no template step calls the refs API, and `terraform-release.yml` has no step; raised with platform), the release caller and the dev suite each end with a `cleanup` job (`needs` the work job, `if: always()`, `timeout-minutes: 2`, `permissions: {contents: write}` on that job only) that deletes its own request branch through the job's `GITHUB_TOKEN`, only while the branch head is still `github.sha`, so a newer request pushed meanwhile survives. A delete made with `GITHUB_TOKEN` starts no run. Runs and the Git Data API records stay readable after the delete (S-37), so the staging gate does not need the branches, and with the branch gone a re-request or re-run is a plain push again (no force push). Never add the job by hand: adopting repos copy the templates byte for byte at a recorded tag, and the reviewer checks that. Until a repo's copies have it, its request branches stay, and a local session sweeps them (below). `standards-check` CI-01 already accepts that job (and only one that does nothing but the guarded delete).

## What stays a local task

Dev releases, the dev suite and staging releases are pushes, so they are never local tasks ([[local-tasks]]). A local task is only for what a cloud session genuinely cannot push:

- **The interim branch sweep**, only in a repo whose workflows have no `cleanup` job yet: one `other` local task per project per week (never one per release, no approval needed), whose steps list `git ls-remote origin 'refs/heads/release/*' 'refs/heads/test/dev/*'` and then one `git push origin --delete <branch>` per branch whose staging release (or, for `release/prod/*`, prod apply) has concluded, or that is over 30 days old (S-37). It is dropped once the repo's workflows clean up after themselves.
- **A repo that has not adopted the pipeline yet:** its dispatch-only workflows stay `gh-dispatch` local tasks until its adoption PR merges; the fix is the adoption, which the weekly audit tracks.
- **Release-candidate tags** (CI-13): the proxy blocks tag pushes, so a tag cut after the owner's card stays a `release-asset` local task.

The proxy accepts these pushes: the fleet-console probe of 2026-10-25T02:06Z (routine run `cse_01XAvcUaC1DpS3MFXAR85SR8`) pushed `release/probe/T`, `test/dev/probe-T`, `plan/probe/T`, `claude/release/probe/T` and `claude/probe-T`, all accepted. If a request push is refused anyway (a 403 naming the branch), that is an environment defect, not a release step: stop the release, quote the 403 in the status block, and raise one page item with an `owner_action` (only the owner can change the cloud environment's GitHub access), unless an open one already names it. Do not make it a local task, and do not fall back to a dispatch.

**Untested alternative, not the path:** in the same probe `gh api -X POST repos/<owner>/<repo>/dispatches -f event_type=probe` (a `repository_dispatch`) returned no error, so the proxy may let a session start a `repository_dispatch` workflow. It is unverified (that repo has no workflows, so nothing ran), and the release contract stays the pushed request branch.
