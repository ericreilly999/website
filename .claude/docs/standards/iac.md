# Infrastructure-as-code standards

Terraform for every fleet project. Read with the module rules in [devops-engineer](../../agents/devops-engineer.md) and [aws-multi-account](../agent-conventions/aws-multi-account.md). Rule format and waivers: [README](README.md).

### IAC-01 · Every root has a remote, locked backend

Every Terraform root MUST use a remote backend with state locking (S3 with a DynamoDB lock table or `use_lockfile = true`, or HCP Terraform); NEVER local state.

- **Why:** local state is lost with the checkout and lets two applies race ([devops-engineer](../../agents/devops-engineer.md) module rules; gencast ADR-015 §2.2; platform ADR-0002 rules 3-4, PL-37).
- **Reference:** GenCast `backend/terraform/envs/<env>/versions.tf` (`backend "s3"` with `dynamodb_table`, `encrypt = true`). A partial backend (`backend "s3" {}` filled by a gitignored `backend.hcl`, as odds-analysis does) passes when a committed `*.tfbackend` or `backend.hcl.example` shows the lock setting.
- **Enforced by:** `standards-check IAC-01`. A bootstrap root may hold local state only for its first, logged apply, then migrates (`init -migrate-state`).

### IAC-02 · State lives in its environment's own account

Each environment's state bucket and lock table MUST live in that environment's own AWS account (versioned, encrypted, public access blocked, `prevent_destroy`), keyed `<project>/<env>/<root>.tfstate`; the management account NEVER holds state.

- **Why:** a central bucket gives one principal every environment's state; the management account is billing-only (gencast ADR-015 §2.2; owner 2026-10-24, Q-39/PL-63; this replaces the central-bucket line formerly in aws-multi-account.md).
- **Reference:** GenCast `backend/terraform/modules/state-bootstrap`, `envs/staging/bootstrap/backend.tf`.
- **Enforced by:** review. Known gaps: odds-analysis and website keep state in the management account (see the audit report).

### IAC-03 · No state or plan files in git

`*.tfstate`, `*.tfstate.backup` and `*.tfplan` files MUST NEVER be committed, and a repo with Terraform MUST list all three in `.gitignore`.

- **Why:** state and saved plans carry resource ids and often secret values (owner, Q-8, 2026-10-16, odds-analysis security review F16; platform ADR-0003 rule 4).
- **Reference:** GenCast `.gitignore` (`*.tfstate`, `*.tfstate.backup`, `*.tfplan`). A saved plan's sha256 may be recorded; the file is not.
- **Enforced by:** `standards-check IAC-03` (FAIL for a tracked file, WARN for a missing `.gitignore` pattern).

### IAC-04 · Stateful resources cannot be destroyed by accident

Every stateful resource (databases, DynamoDB tables, data buckets, file systems, user pools, KMS keys) MUST carry a literal `lifecycle { prevent_destroy = true }` in every environment, unless the pipeline runs a destroy guard (CI-08).

- **Why:** `prevent_destroy` is plan-time only and cannot be a variable, so it must be literal in the module (FL-6 item 2, 2026-09-23; gencast ADR-015 §5; website `modules/static_site/main.tf`).
- **Reference:** GenCast resource `lifecycle` blocks plus `scripts/deploy/destroy-guard.py`; odds-analysis RDS also sets `deletion_protection = true`, which the provider can lift before a replace, so `prevent_destroy` closes that gap.
- **Enforced by:** `standards-check IAC-04` (WARN).

### IAC-05 · Environments differ only by tfvars

Each environment MUST be a thin root (`envs/<env>/`) that calls one shared module set and holds only provider (`allowed_account_ids`, `default_tags`), backend and tfvars; NEVER workspaces, copied environment code, or code that branches on the environment name.

- **Why:** copied roots drift, and a `var.environment == "prod"` branch is code staging never ran (gencast ADR-015 §1, §2.3; platform ADR-0002 rules 1-2 and ADR-0003 rule 2, PL-37).
- **Reference:** GenCast `backend/terraform/envs/{dev,staging,prod}` over `backend/terraform/modules/*`; `scripts/deploy/dev-literals.txt` keeps dev literals out of modules. Modules hold no account ids, ARNs, hostnames or environment names.
- **Enforced by:** review (no `resource` blocks in an environment `main.tf` is BLOCKING).

### IAC-06 · Lock files and versions are pinned

Every root MUST commit `.terraform.lock.hcl` (with `linux_amd64` and `windows_amd64` hashes) and pin one Terraform version, and pipelines MUST run `init -lockfile=readonly`.

- **Why:** an unpinned provider changes the plan between runner and workstation (gencast ADR-015 §7.4, D-209; platform ADR-0003 rule 7).
- **Reference:** GenCast `backend/terraform/envs/*/.terraform.lock.hcl`; init flags in `deploy-*.yml`.
- **Enforced by:** review.

### IAC-07 · Re-addressing ships `moved` blocks

A change that renames a resource or converts it to `count`/`for_each` MUST ship `moved` blocks in the same change and prove a 0-add, 0-destroy plan against every affected environment's real state.

- **Why:** goldens and `validate` cannot see a re-address, and a `count` conversion nearly destroyed a live phone number ([code-reviewer](../../agents/code-reviewer.md) Terraform; gencast ADR-015 §1).
- **Reference:** GenCast `backend/terraform/moved-*.tf`.
- **Enforced by:** review.

### IAC-08 · Every environment has a billing tripwire

Every environment MUST get an AWS Budget (alerts at 80% actual and 100% forecast) in its first pipeline run, and every alert target MUST be `ericreillyconsulting@gmail.com`.

- **Why:** a CloudWatch EstimatedCharges alarm has no data in member accounts (FL-6 item 2; gencast ADR-015 §5, B-138; alert address owner 2026-10-16, Q-7).
- **Reference:** GenCast `backend/terraform/modules/ops` (`aws_budgets_budget`); odds-analysis `modules/billing`.
- **Enforced by:** review.

### IAC-09 · Checkov gates on a reasoned skip list

Terraform MUST pass Checkov before push and in CI, gated on a committed skip list where every skip has a one-line reason; low-sensitivity SNS topics and trail buckets may skip paid KMS and replication.

- **Why:** a severity gate needs a paid key and hides why a finding was accepted (platform D-042; owner PL-30, PL-32, 2026-10-13).
- **Reference:** platform `.checkov.yaml` and `scripts/check-modules.sh`.
- **Enforced by:** review.

### IAC-10 · Out-of-band changes are written down when made

Any workstation or console AWS change outside a pipeline MUST be recorded in `.project/deployment-log.md` (what, when, why) at the time it is made.

- **Why:** without a trace a later session cannot tell "already done" from "deliberately different", and CloudTrail reconstruction costs a session ([devops-engineer](../../agents/devops-engineer.md); FL-6).
- **Reference:** GenCast `.project/deployment-log.md`.
- **Enforced by:** review.

### IAC-11 · A paused project is hibernated

A paused project's infrastructure MUST be scaled to zero behind one Terraform flag, its workflows reduced to `workflow_dispatch`, with a restore runbook; agents NEVER re-propose the scale-down.

- **Why:** idle infrastructure is the largest avoidable cost of a paused project (owner 2026-10-10, DrinkUp).
- **Reference:** drinkupapp `.project/runbooks/hibernate.md`, `deploy-dev.yml` header.
- **Enforced by:** review.

## Proposed (needs owner)

- **A weekly read-only drift plan of every root in every environment**, an unreadable resource counting as an error and the report holding addresses only. Platform ADR-0005, `scripts/tf-standards/drift_plan.py`. It needs a decision on how it runs: a `schedule` workflow breaks CI-01 and spends minutes outside P-2, so it would run from a session or routine.
- **A state guard** (bucket policy plus a plan-time caller precondition) so only the deploy role reads state. GenCast `modules/state-guard` (ADR-015 §4.2; GenCast-only).
- **A logged, `-target`ed bootstrap apply per account with the plan asserted exactly**, then `init -migrate-state`. GenCast `backend/terraform/README.md`.
- **A per-environment kill switch, not-running alarm and first-run dry run for each scheduled auto-acting resource.** GenCast D-302.
- **A permissions boundary on admin deploy roles before go-live.** GenCast ADR-015 §4.3 known gap, backlog B-294.
- **Named placeholders that fail the plan** for per-environment values that gate an apply. GenCast D-305.
- **Layered roots per environment** (`envs/<env>/<layer>/`) with cross-layer inputs from SSM, never `terraform_remote_state`. Platform ADR-0002 (accepted for platform under PL-37; GenCast uses one root per environment, so a fleet rule needs a decision).
- **Module releases as annotated `modules/<name>/vX.Y.Z` tags, pinned exactly, never moved.** Platform ADR-0001 (Proposed); GenCast vendors with `VENDORED.sha256`.
- **A module layout and policy check** (no provider block, version ranges, no literals, a validation test per input). Platform `modules/README.md`, `scripts/check-modules.sh`.
- **An environment parity check** with declared differences in `envs/parity.json`. Platform ADR-0006.
- **DB-level `REVOKE UPDATE, DELETE` on append-only tables**, with a test that tries both. odds-analysis decisions 2026-09-07.
