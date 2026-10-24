# AWS access standards

Accounts, how pipelines and agents get credentials, cloud users, key rotation and the root-key lane. Read with [aws-multi-account](../agent-conventions/aws-multi-account.md) (Stage 0 setup), [cloud-environment](../cloud-environment.md) (cloud secrets) and the IAM tiers in [autonomy-bar](../agent-conventions/autonomy-bar.md). Rule format and waivers: [README](README.md).

### AWS-01 · One account per environment; the management account is billing-only

Each project MUST run dev, staging and prod in their own member accounts under the one Organization, and the management account MUST hold no workloads and no Terraform state; shared tooling goes in the platform account.

- **Why:** an account is the only hard blast-radius boundary AWS offers (aws-multi-account.md; drinkupapp D-019; owner 2026-10-24, Q-39/PL-63; platform D-100). Whether agent IAM users (`{project}-devops` from Stage 0, `fleet-cloud-*`) must also leave the management account is not settled; see Proposed.
- **Reference:** GenCast dev, staging and prod accounts, each with its own state and deploy role; `scripts/lib/aws_accounts.py resolve` reads the layout live.
- **Enforced by:** review. Known gaps: website runs staging and prod in the management account; odds-analysis is one account by owner decision and keeps state in the management account.

### AWS-02 · Pipelines assume a role through OIDC

Every workflow that calls AWS MUST use `aws-actions/configure-aws-credentials` with `role-to-assume` (GitHub OIDC), built from `vars.*`, and MUST NEVER pass `aws-access-key-id`, `aws-secret-access-key` or `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` from secrets.

- **Why:** a static key in GitHub secrets is a long-lived credential nobody rotates (FL-6 item 1, 2026-09-23; [cloud-environment](../cloud-environment.md) "Deploy credentials never go here").
- **Reference:** GenCast `deploy-staging.yml` (`role-to-assume: arn:aws:iam::${{ vars.STAGING_AWS_ACCOUNT_ID }}:role/${{ vars.STAGING_DEPLOY_ROLE_NAME }}`, `permissions: id-token: write`).
- **Enforced by:** `standards-check AWS-02`.

### AWS-03 · Deploy-role trust names one repo and one environment

Each environment's deploy role MUST trust only that account's own GitHub OIDC provider, with `aud = sts.amazonaws.com` and `sub` matched by `StringEquals` to the exact repository and `environment:<env>-deploy`; NEVER a wildcard, branch or pull-request subject. The GitHub Environment is restricted to `main`.

- **Why:** a wildcard subject lets any branch or fork workflow deploy (gencast ADR-015 §4.3, D-209; odds-analysis `modules/github_oidc`).
- **Reference:** GenCast `backend/terraform/modules/github-oidc-deploy-role`; Environments `staging-deploy`, `prod-deploy`. Prefer the immutable `repo:<owner>@<id>/<repo>@<id>` subject form.
- **Enforced by:** review. A new OIDC deploy role or widened trust is Tier 3 (AWS-08).

### AWS-04 · Each project has its own cloud user

Each project's cloud environment MUST use its own IAM user `fleet-cloud-<slug>` that can only assume its own `/fleet/*` roles (dev write, staging and prod read-only), with one active key held only in the environment's network secret; agents NEVER share or read back another project's key.

- **Why:** one shared key gave every routine every project's access (FL-14, owner chat 2026-10-21; platform D-098).
- **Reference:** [cloud-environment](../cloud-environment.md) Per-project environments; `scripts/sync-project-definitions.js` writes `.claude/aws-profiles.json` from the project's own rows; platform `modules/fleet-agent-access`.
- **Enforced by:** `sync-project-definitions.js` (profiles by slug prefix, `--check` drift).

### AWS-05 · Cloud-user keys rotate within 90 days

Every `fleet-cloud-*` access key MUST be rotated at least every 90 days, and the daily cost scan MUST report any key older than that.

- **Why:** the cloud keys are the fleet's only long-lived agent credentials (owner, Q-40/PL-67, 2026-10-24).
- **Reference:** none yet: the key-age check is open work (Q-40).
- **Enforced by:** review, until the cost-scan key-age check lands.

### AWS-06 · The root key is a bootstrap lane only

The management-account root key MAY be used only for platform bootstrapping: plan first, apply only a plan that matches an owner-approved item, one `.project/deployment-log.md` entry per use; NEVER for workloads, data or everyday reads. The lane closes when the root keys are retired.

- **Why:** root bypasses every guardrail the fleet builds (FL-13, owner chat 2026-10-12, page-recorded 2026-10-16; platform D-078, D-096 to D-098).
- **Reference:** platform `.project/deployment-log.md` (per-use entries); GenCast D-325 keeps a use count.
- **Enforced by:** review.

### AWS-07 · Named, non-root profiles only

Every AWS call MUST use a named non-root profile; the root or `[default]` profile MUST NOT be a workstation default, and scripts MUST refuse `default` and `OrganizationAccountAccessRole` by name and by caller ARN.

- **Why:** a stray call fell through to the root `[default]` profile in a test run (owner PL-45, PL-31, 2026-10-13; platform D-005, D-088).
- **Reference:** fleet-console cost scan refuses `default` and the org-access role before any request (fleet-console D-052); platform test runners force a neutral AWS environment.
- **Enforced by:** review.

### AWS-08 · IAM writes are Tier 3; read-only and tightening are P-1

A new principal with write access, a write grant, or any grant that lets one environment's role act in another MUST go to the owner (Tier 3) in every environment; read-only, least-privilege and tightening changes at $0 are P-1.

- **Why:** write grants are how an agent widens its own reach ([autonomy-bar](../agent-conventions/autonomy-bar.md) P-1 and IAM by environment, 2026-10-20; platform D-001, D-004).
- **Reference:** [autonomy-bar](../agent-conventions/autonomy-bar.md); staging and prod IAM still go through the pipeline (CI-05).
- **Enforced by:** review.

### AWS-09 · Staging and prod are read-only for agents

In staging and prod, agents MUST be read-only: writes go through the pipeline, cloud sessions MAY run read-only `terraform plan` through plan roles but NEVER apply, and an owner write outside the pipeline uses the MFA elevation role (one hour, alerted) with a break-glass entry in `.project/deployment-log.md` within 24 hours.

- **Why:** staging and prod change only through reviewed plans (owner GC-200, 2026-10-24; Q-42; owner PL-31, PL-5, PL-14; platform ADR-0005 rules 6-8).
- **Reference:** GenCast `backend/terraform/scripts/gc54-verify-agent-access.sh` (non-mutating probe of the agent roles); platform `elevation-alerts` module.
- **Enforced by:** review (the plan roles and `plan.yml` are open work, Q-42).

### AWS-10 · Grants are simulated before deploy

A role's required actions MUST be listed in `.project/checks.json` and pass `simulate-principal-policy` before a deploy is done.

- **Why:** missing grants otherwise surface as runtime 403s in staging (existing convention: `docs/agent-conventions/verification-checks.md` When each check is required; `agents/devops-engineer.md` Release smoke).
- **Reference:** `scripts/checks/iam-simulate.sh`.
- **Enforced by:** `iam-simulate.sh` in release smoke.

### AWS-11 · No unprompted writes to money or messaging connectors

Agents MUST NOT hold write access to money or communication connectors (trades, email send, Drive share, calendar edit); those tools are denied, reads are kept.

- **Why:** a connector write acts in the owner's name and cannot be rolled back (owner PL-44, PL-66, 2026-10-11; PL-65 removed the Stripe MCP).
- **Reference:** Claude Code `permissions.deny` rules for the connector write tools.
- **Enforced by:** Claude Code settings deny rules.

## Proposed (needs owner)

- **Agent principals live in the platform account, not the management account.** Platform D-100 records the owner putting "agent principals and the pipeline" in the platform account, but aws-multi-account.md Stage 0 still creates `{project}-devops` there and the `fleet-cloud-*` users sit there today.
- **An owner-MFA lane for anchor applies** (platform-account and management-account IAM, member trust anchors): saved plan, page card verified, MFA session primed within 15 minutes, post-apply plan exit 0. Platform FA-FR-62 (pending PL-62).
- **Two-hop cloud plan access** (user key assumes a per-project hub, the hub assumes the spoke, 900-second sessions, `plan -lock=false`). Platform FA-FR-47 (pending PL-62).
- **Fixed agent role tiers** (`FleetAgentDev`, `FleetTriageReadOnly`, `FleetCostRead`) at `/fleet/`, a Deny-only guardrail, trust listing only IAM users. Platform FA-FR-01 to 06, 26-32.
- **Anchor changes never applied by the pipeline**; staging, prod and IAM-class dev changes need a page card with the change hash. Platform FA-FR-53 (pending PL-62).
- **A fixed access ladder for agents on third-party services**, with USD-only, cart-hashed spend gates. Platform D-062 to D-068 (PL4, not built). The purchase rule itself is already owner-decided (PL-35, PL-46, PL-47: no purchase without a page item showing cart, total and screenshot) and is not an engineering standard.
