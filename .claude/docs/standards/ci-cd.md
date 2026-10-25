# CI/CD standards

GitHub Actions workflows and the deploy path from `main` to prod. Read with [ci-discipline](../agent-conventions/ci-discipline.md) (local-first habits, P-2) and [verification-checks](../agent-conventions/verification-checks.md) (release smoke, sign-off). Rule format and waivers: [README](README.md).

### CI-01 · Triggers match what the workflow does

A workflow MUST trigger only on `workflow_dispatch` or `workflow_call`, a path-gated `pull_request` check, a path-filtered `push` to main that deploys dev, a `push` to `plan/**` branches for a plan-only workflow on a read-only role, or a `push` to release-request branches: `release/<dev|staging|prod>/*` for a release workflow and `test/dev/*` for the dev integration suite. A staging or prod deploy MUST start only from a `workflow_dispatch` or a release-request push every job of which counts as a deploy and runs the gate first: the release commit is on main (every environment); staging also needs a successful dev-suite run at the same commit, checked inside the job; prod also needs the approval card, the commit and the change hash, and refuses on a hash mismatch. A workflow NEVER triggers on an unfiltered `push`, an unfiltered `pull_request` (unless an owner decision waives it, below), `pull_request_target`, or `schedule`.

- **Why:** an unfiltered trigger spent 1,952 of 2,000 free minutes in seven days, and staging and prod change only through a gated pipeline (FL-6 owner note 2026-09-23, path-gated dev triggers; FL-6 pipeline-only rule and gencast ADR-015 §7.1; GC-200/Q-42, owner 2026-10-24, `plan/**` plan runs; gencast D-346). A cloud session can push a branch but cannot dispatch a workflow, so release runs start from pushed request branches (FL-19 B, owner 2026-10-24: agents run the pipeline setup, "We need these patterns established so our cloud sessions can move seamlessly"); staging needs no owner approval once the dev integration suite has passed against dev at the same commit, all changes included, and prod still needs an approved card naming the commit and the plan's change hash (FL-20 B, owner 2026-10-24; platform spec `spec/pl1-fleet-agent-access.md` v1.5.0, FA-FR-72 to FA-FR-77).
- **Reference:** GenCast, all `.github/workflows/*.yml` are `on: workflow_dispatch`; staging gets each merge commit by dispatch, which P-2 covers. A dev deploy may run on `push: {branches: [main], paths: [...]}` ([ci-discipline](../agent-conventions/ci-discipline.md) Trigger-path discipline). A required PR check is path-gated by a `changes` job plus a job-level `if:` (odds-analysis `pr-validation.yml`), never by a workflow-level `paths`/`paths-ignore`, because a path-skipped workflow reports no check and the PR waits forever. The release-request pipeline is platform's `templates/workflows/` (`terraform-release.yml`, the caller on `release/{dev,staging,prod}/*`; `terraform-pipeline.yml`, the reusable workflow whose `release` job runs `scripts/pipeline/release_gate.py request`, then `evidence` for staging, then `compare` before the prod apply; `dev-integration-suite.yml`, whose `guard` job runs `release_gate.py suite-guard`), copied byte for byte at a recorded `tools/pipeline/vX.Y.Z` tag; the push filters are exactly those patterns (FA-FR-76). How a session drives it: [cloud-releases](../agent-conventions/cloud-releases.md).
- **The WS-3 waiver.** An unfiltered `pull_request` required check is allowed only where an owner decision approves it, recorded in the workflow as `# standards-waive: CI-01 <decision id>`: website's `pr-checks.yml` carries `# standards-waive: CI-01 WS-3` (owner, 2026-09-22: a required status check must not be path-filtered, because a path-filtered `pull_request` job never starts and the PR then waits forever; website decisions.md, Follow-on (WS-3)). The check reports `waived`, never `pass`; the waiver covers only the unfiltered `pull_request` finding, so any other CI-01 finding added to the same file still fails; the code reviewer verifies the decision id against the project's decisions and that the workflow is still what the decision approved (the required check, `npm test` only, no secrets, no deploy). The minute rules (GHM-01 to GHM-03) still apply to it.
- **Enforced by:** `standards-check CI-01`: an unfiltered `push` or `pull_request`, a `schedule`, a `push` on a workflow that deploys staging or prod (its name, file name or a job's environment says staging or prod) other than a gated release-request push, and a `plan/**` push workflow that applies (`terraform apply` with or without global options such as `-chdir=`) all FAIL, unless waived as above. A `push` on `release/` or `test/` branches passes only when: its branch patterns are exactly `release/<dev|staging|prod>/*` or exactly `test/dev/*` (not both, no `paths`, `tags` or `branches-ignore`); for `release/`, every job the push reaches is a deploy, whatever its commands: the workflow's own jobs and those of the reusable workflow a job calls, which must be `./.github/workflows/<file>` or this repo's own `<owner>/<repo>/.github/workflows/<file>@main` (`<owner>/<repo>` from the origin remote or `--slug`; another repo, another ref, an unreadable file or a call nested in the callee is a FAIL, since its gate cannot be read). Each such job must run the platform template's own gate steps, compared by exact text, with no shell parsed: every step up to and including the last gate the push needs (`release_gate.py request` for every environment, `evidence` when `release/staging/*` is listed, `compare` when `release/prod/*` is listed, in that order) must equal one of the template `release` job's steps from before that gate, or the gate step itself. A step equals a template step when it has exactly the template step's keys apart from `name`, and each is the same: `run:` and `if:` compared with whitespace collapsed, `id` (the later gates' `if:` reads `steps.gate.outputs`), `env`, `with:`, and the action at the template's pinned SHA. So an added `shell`, `working-directory`, `continue-on-error` or `env`, or a changed `id`, is not a template step. Anything else before a gate fails, naming the step, and so does a job `env`, `defaults`, `container`, `services`, `continue-on-error`, `environment` or `runs-on` that differs from the template job's (an Environment's vars and secrets would override the repository's), or any workflow `env` or `defaults`. The reference is the template copied into `scripts/checks/lib/platform-templates/` (platform tag `tools/pipeline/v1.0.0`, spec v1.5.0; its README records the tag); a new template tag means copying the files again. The one job exempt is the cleanup job that only deletes its own request branch, recognised the same way against the proposed `request-branch-cleanup.yml` (exact steps and permissions; [cloud-releases](../agent-conventions/cloud-releases.md)). For `test/dev/*`, a job's steps through `release_gate.py suite-guard` must equal the template `guard` job's, and it holds no Environment, secret or OIDC token; every other job `needs` it, only the cleanup job may run when it failed (`always()`, `failure()`, `cancelled()`), and none applies or deploys. A job counts as off an event only when its `if:` is `&&`-joined terms one of which is `github.event_name == '<another event>'` or `!= '<that event>'`; any `||`, `!`, parentheses or function call counts as running on every event. Such a job is not counted as an ungated PR job, and `git -C <dir> diff --name-only` counts as a path filter; a waiver with no decision id is itself a FAIL. `pull_request_target` always FAILs, whatever its paths or gating, and cannot be waived. `workflow_run`, `issue_comment`, `pull_request_review` and `pull_request_review_comment`, which a pull request can reach, FAIL when the workflow uses secrets (any `secrets` other than `secrets.GITHUB_TOKEN`) or grants `id-token: write`/`write-all`, and otherwise WARN. A workflow the check cannot read (not UTF-8, for example UTF-16 or a Windows-1252 smart quote; not a YAML mapping; no `on:`) FAILs CI-01 and every other workflow rule for that file, and no waiver covers it. A tag-only `push` WARNs.

### CI-02 · Every job has a timeout

Every job MUST set `timeout-minutes` (a reusable-workflow call takes the callee's).

- **Why:** a hung job runs to the 360-minute default and spends a month's P-2 budget in one run (P-2, owner 2026-10-20; existing convention: `skills/code-reviewer/references/review-checklists.md` CI/CD Pipeline Checklist, "Workflow has `timeout-minutes` set").
- **Reference:** GenCast `place-secrets.yml` (2 minutes for gate jobs, 15 for work).
- **Enforced by:** `standards-check CI-02`.

### CI-03 · Deploy workflows never run twice at once

A workflow that deploys, applies or places secrets MUST set `concurrency` with a fixed group per workflow and environment and `cancel-in-progress: false`, at the workflow level or on every job that deploys.

- **Why:** two applies on one state, or a cancelled apply, leave state locked or half-written (gencast ADR-015 §7.1; odds-analysis `build-and-push-image.yml`; standards-check scope approved 2026-10-24).
- **Reference:** GenCast `deploy-staging.yml` (`concurrency: {group: deploy-staging, cancel-in-progress: false}`), `deploy-prod.yml`, `place-secrets.yml`. Pure test jobs (test, e2e, verify, smoke) may cancel in progress or carry no concurrency; website `deploy-staging.yml` sets it on its deploy jobs only.
- **Enforced by:** `standards-check CI-03` (a deploy workflow is one with a deploy step, such as `terraform apply`, `aws s3 sync`, `aws lambda update-*`, a CloudFront invalidation or an ECS update, or whose name or file name says deploy, release, promote, apply, publish or secret and that uses a GitHub Environment, AWS credentials, Terraform or the AWS CLI). With job-level concurrency only the jobs with a deploy step are judged (when none has one, the jobs with an Environment or AWS credentials). A reusable workflow's deploy job that runs only under `workflow_call` takes the concurrency of the job that calls it (platform `terraform-release.yml` sets it on its one `release` job); with no caller in the repo (Platform commits only the reusable workflow) it WARNs.

### CI-04 · Permissions are declared

Every workflow MUST declare `permissions` at the top level or on every job, least privilege, and a pull-request job NEVER gets `id-token: write` unless it assumes only a read-only plan role: the plan role first, then at most role-chained read-only spokes, and no deploy step.

- **Why:** the token default can be write-all, and a PR that can mint an AWS token can deploy (website decisions 2026-03-28; gencast ADR-015 §4.3). A read-only plan role whose trust names the pull-request subject cannot deploy: it can only assume read-only spokes, and Terraform runs `plan -lock=false` through it (platform spec pl1 v1.5.0 FA-FR-50, the `plan` trust's pull-request statement; FL-19 B, owner 2026-10-24).
- **Reference:** GenCast `deploy-staging.yml` (`contents: read`, `id-token: write`); website `deploy.yml` PR job (`contents: read`); platform `templates/workflows/terraform-pipeline.yml` job `plan` (`id-token: write`, `vars.PIPELINE_PLAN_ROLE_ARN`, then `vars.PIPELINE_PR_SPOKE_ARN` with `role-chaining: true`; its `release` job holds the deploy roles and runs only on push).
- **Enforced by:** `standards-check CI-04`: permissions declared; in a `pull_request` workflow, a job that runs on pull requests (its `if:` does not keep it off them) and holds `id-token: write` (its own or the workflow's) FAILs unless every role its `configure-aws-credentials` steps assume is a read-only plan role by the spec's names: the first `arn:aws:iam::<account>:role/pipeline/<repo>-plan`, `role/fleet/FleetPlanHub-<project>` or `${{ vars.PIPELINE_PLAN_ROLE_ARN }}`, and each later one either such a role or, with `role-chaining: true`, `role/fleet/FleetPlanReadOnly`, or `${{ vars.PIPELINE_PR_SPOKE_ARN }}` (a name that merely contains "plan" does not count), and it has no deploy step; a reusable-workflow call holding the token always FAILs, and so does `id-token: write` under `pull_request_target`. That the role is in fact read-only (its trust and permissions) is checked in review against the role's Terraform; least privilege by review.

### CI-05 · The pipeline is the only path to staging and prod

Code and infrastructure MUST reach staging and prod only through the deploy pipeline; a workstation `terraform apply` or `aws` write is dev-only and logged in `.project/deployment-log.md`.

- **Why:** most real changes in two projects bypassed pipelines that already existed (FL-6, 2026-09-23; P-10 covers prod only through the pipeline).
- **Reference:** GenCast `backend/terraform/modules/state-guard` (state readable only by the deploy role) and `*-deploy` OIDC roles.
- **Enforced by:** `git-guard.js` (`terraform_prod` blocks a session apply on a prod path; `prod_release_unapproved` blocks a write of `release/prod/*`, other than a prod plan request, without `FLEET_PROD_RELEASE_APPROVED=<card id>` equal to the request commit's `Release-Card`, whether by `git push` or `gh api` on `git/refs`, and blocks every MCP branch or file write there); staging by review and the release gate.

### CI-06 · A deploy proves its SHA is on main

A deploy workflow MUST check that its input SHA is an ancestor of `origin/main` and refuse otherwise.

- **Why:** a dispatch can name any commit, including an unreviewed branch (gencast ADR-015 §7.1 step 1).
- **Reference:** GenCast `scripts/deploy/check-sha-on-main.sh`, step 1 of `deploy-staging.yml` and `deploy-prod.yml`.
- **Enforced by:** review.

### CI-07 · Apply the saved plan

An apply MUST apply the plan file the same pipeline saved and reviewed (`plan -out`, then apply that file); NEVER `-auto-approve` a fresh plan. In prod, plan and apply are separate runs, and the apply either names the plan run or, in the release-request pipeline, re-plans with the state lock and applies that saved plan only when its change hash equals the one on the approved card.

- **Why:** a fresh plan can differ from the one that was reviewed (gencast ADR-015 §7.1; platform ADR-0003 rule 4, accepted under PL-37). The change hash (SHA-256 over the plan's sorted resource changes, the commit, the root and the environment) pins the reviewed changes as tightly as a plan run id, and a cloud session can carry it in a pushed request where it cannot dispatch with a run id (FL-20 B, owner 2026-10-24; platform spec pl1 v1.5.0 FA-FR-75, Q-T361-6).
- **Reference:** GenCast `deploy-prod.yml` (`mode=plan`, then `mode=apply` with the plan run id under 24 h old), `scripts/deploy/verify-plan-run.py`, `read-prod-plan.py`. Platform `templates/workflows/terraform-pipeline.yml` job `release`: a prod `Release-Mode: plan` request run gives the hash for the card; the apply request carries `Release-Card` and `Release-Change-Hash`, re-plans, and `release_gate.py compare` refuses a different hash (`hash-mismatch`) before `terraform apply` of the saved plan ([cloud-releases](../agent-conventions/cloud-releases.md)).
- **Enforced by:** review; `standards-check CI-01` requires the working `release_gate.py compare` step before `terraform apply` on a `release/prod/*` push. Plan files are never committed (IAC-03).

### CI-08 · A destroy guard gates every apply

Before an apply, the pipeline MUST read `terraform show -json` and fail unless every delete or replace is named exactly in a dispatch input; a plan guard counts destroys and replaces, never total changes.

- **Why:** a destroy of a stateful resource is the one plan outcome review cannot undo (gencast ADR-015 §7.3, D-236; [devops-engineer](../../agents/devops-engineer.md) plan-diff rule).
- **Reference:** GenCast `scripts/deploy/destroy-guard.py` (input `allow_destroy`, no wildcards), step 4 of `deploy-*.yml`.
- **Enforced by:** review; `standards-check IAC-04` accepts a destroy guard in place of `prevent_destroy`.

### CI-09 · Prod takes only a SHA proven on staging

Prod MUST refuse a SHA unless a successful staging deploy of exactly that SHA is recorded (an annotated tag or a sign-off manifest that prod verifies fail-closed), and deploy runs carry the full input SHA in `run-name`; NEVER match a dispatch run by `head_sha`. In the release-request pipeline the record is the staging release run of that SHA (its title `release: staging apply <root> <sha>` carries the SHA): the session confirms that run concluded `success` before it pushes the prod plan request, and the approved card names that run with the commit and the change hash, so the prod job's hash compare applies only what the owner approved for a staging-proven SHA.

- **Why:** a dispatch run's `head_sha` is main's tip, not the deployed SHA (gencast ADR-015 §7.2 and Amendment 1, D-209; platform ADR-0003 rules 6 and 8; drinkupapp `deploy-prod.yml` manifest gate). The release-request template checks dev evidence in the job only for staging, so for prod the staging proof is the session's pre-push check plus the owner's card (FL-20 B, owner 2026-10-24; platform spec pl1 v1.5.0 FA-FR-75, FJ35 "Entry: a `<sha>` that passed staging"). Moving it into the job, a prod `evidence` step that reads the staging release run as FA-FR-73 reads the dev one, is a platform follow-up; once the template has it, the job check replaces the session's.
- **Reference:** GenCast `scripts/promote/accept-staging.sh` (`staging-accepted/<sha>`), `scripts/promote/verify-staging-accepted.sh`, `run-name:` in `deploy-staging.yml`. Each merged PR also needs a PASS sign-off record ([verification-checks](../agent-conventions/verification-checks.md), `signoff-read.js`). Release-request pipeline: [cloud-releases](../agent-conventions/cloud-releases.md) Prod, steps 1 to 3.
- **Enforced by:** review; `signoff-read.js` for the sign-off records; for the release-request pipeline, the PM's card check (agent rule 2) and the session's pre-push check.

### CI-10 · Build once, promote by digest

An artifact (zip, image, layer) MUST be built once from hash-pinned inputs and promoted to staging and prod by digest; NEVER rebuilt per environment.

- **Why:** a rebuild ships bytes nobody tested (platform ADR-0003 rules 1 and 3, PL-37; [devops-engineer](../../agents/devops-engineer.md) Pipeline 4 step 3; gencast B-114/B-115).
- **Reference:** GenCast `.github/actions/build-lambda-layers/action.yml`, `scripts/deploy/layer-digests.py` (apply fails closed when a layer sha256 differs from the plan job's); drinkupapp pulls the staging image from staging ECR.
- **Enforced by:** review.

### CI-11 · Guards run from the workflow's own commit

The checks that judge a deploy (SHA on main, destroy guard, promotion verify) MUST run from a checkout of `github.workflow_sha`, NEVER from the `inputs.sha` tree being deployed.

- **Why:** a guard read from the deployed tree can be edited by the change it guards (gencast ADR-015 §7.5, D-236).
- **Reference:** GenCast `$GUARD_DIR` second checkout in `deploy-staging.yml` and `deploy-prod.yml`; Environments restricted to `main`.
- **Enforced by:** review.

### CI-12 · Release smoke before a deploy is done

A deploy MUST NOT be called done until release smoke passes against that environment.

- **Why:** a green pipeline shipped zips missing modules and staging pointing at dev ids (existing convention: `docs/agent-conventions/verification-checks.md` When each check is required; `agents/devops-engineer.md` Release smoke).
- **Reference:** `scripts/checks/handler-import-smoke.py`, `iam-simulate.sh`, `env-leak-scan.js`; GenCast `backend/terraform/scripts/stale_code_detector.py` after apply.
- **Enforced by:** the verifier's release-smoke check.

### CI-13 · Tags are not an iteration loop

A tag push MUST NEVER be used to test a change, and a release-candidate tag MUST NOT be pushed without an owner decision (Tier 3), cited as `FLEET_TAG_APPROVED=<id>`.

- **Why:** 18 failed tag pushes spent about 360 minutes on one bug; RC tags are on the Tier-3 list ([ci-discipline](../agent-conventions/ci-discipline.md) Hard rule 1; [autonomy-bar](../agent-conventions/autonomy-bar.md) Tier 3).
- **Reference:** `hooks/git-guard.js` (`tag_push_unapproved`).
- **Enforced by:** `git-guard.js`.

### CI-14 · No environment values in workflow files

A workflow MUST NOT hard-code account ids, role ARNs, bucket names, URLs or regions; they come from `vars.*` (or `secrets.*` when sensitive).

- **Why:** a copied literal points one environment's deploy at another's resources (existing convention: `agents/devops-engineer.md` No hard-coded values).
- **Reference:** GenCast `role-to-assume: arn:aws:iam::${{ vars.STAGING_AWS_ACCOUNT_ID }}:role/${{ vars.STAGING_DEPLOY_ROLE_NAME }}`.
- **Enforced by:** review.

### CI-15 · Dev has pipeline parity

Dev MUST deploy through the same kind of pipeline as staging and prod (a dev-deploy GitHub Environment, secrets placed by the pipeline, the same main-only branch policy), like-for-like as far as possible.

- **Why:** a dev that differs from staging hides the faults staging then finds (owner, Q-9, 2026-10-17).
- **Reference:** GenCast `terraform-dev.yml` (protected environment `dev-terraform-apply`); parity work is a GenCast backlog item.
- **Enforced by:** review.

## Proposed (needs owner)

Not rules. Each is used by one project with no owner or ADR decision behind it, or waits on a pending decision.

- **Pin third-party actions by commit SHA** with a version comment. GenCast `.github/actions/build-lambda-layers/action.yml`.
- **A typed confirm phrase for dev applies** (`confirm_apply = CONFIRM-APPLY-TO-DEV`) and **`confirm_live` for live-money workflows**, refusing a key whose mode does not match the environment. GenCast `terraform-dev.yml`, `stripe-catalog.yml`, `place-secrets.yml`.
- **`plan_only: true` on every deploy workflow**, untaggable as staging-accepted, and **the plan summary written before the guard runs**. GenCast `deploy-staging.yml`, `scripts/deploy/plan-summary.py`.
- **A post-apply code-currency check** (deployed Lambda hashes equal the build). GenCast `stale_code_detector.py` (ADR-015 §7.1 step 10; Lambda-specific, so fleet adoption needs a decision).
- **An anchored semver prod tag filter** (`v[0-9]+.[0-9]+.[0-9]+`) with a fail-closed `startsWith(github.ref, 'refs/tags/v')` guard. website `deploy.yml`.
- **Branch protection whose required context is the PR-check job name**, never renamed without updating the rule. website decisions.
- **A dual go signal for a prod cutover** (Environment approval plus a `GO - vX.Y.Z` issue comment). drinkupapp D-082.
- **Staging auto-apply behind a repo variable**, off until drift is reconciled. drinkupapp `deploy-staging.yml`.
- **A roles-only prod root that skips staging-accepted** under a plan gate limited to named IAM creates. GenCast D-464, D-483, `scripts/deploy/fleet-roles-plan-gate.py`.
