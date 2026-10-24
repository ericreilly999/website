# Secrets standards

Where secret values may live and how they get there. Read with [cloud-environment](../cloud-environment.md) (Environment variables, Secrets) and the Tier-3 list in [autonomy-bar](../agent-conventions/autonomy-bar.md). Rule format and waivers: [README](README.md).

### SEC-01 · Secrets travel only through secret stores

A secret value MUST go only to AWS Secrets Manager, GitHub secrets, or a direct PM session that places it; it MUST NEVER appear on the Fleet Decisions page (any `decisions/*` or `projects/*` field), in Linear, in chat, or in a cloud environment variable.

- **Why:** the page, Linear and environment variables are readable by every viewer and are not encrypted (FL-1 channel rule, 2026-09-22; fleet-console D-009, NFR-4; [cloud-environment](../cloud-environment.md)).
- **Reference:** [cloud-environment](../cloud-environment.md) Secrets (one SigV4 network secret, STS hosts only).
- **Enforced by:** review.

### SEC-02 · No plaintext secrets in Terraform

A Terraform variable that holds a password, token or key MUST NOT have a literal `default`, and an `aws_ssm_parameter` MUST NOT carry a literal or interpolated secret `value`; SSM parameters hold ids and ARNs, and secret values never enter tfvars, plan artifacts or run logs.

- **Why:** anything in a default, an SSM `value` or a plan lands in state and in every plan artifact (gencast ADR-015 §6.2; platform ADR-0002 rule 6; odds-analysis `database_url` embeds the password in state).
- **Reference:** GenCast secret containers as Terraform resources with values placed by `place-secrets.yml`; data sources read existing parameters.
- **Enforced by:** `standards-check SEC-02` (WARN).

### SEC-03 · A pipeline places secret values

Secret containers MUST be Terraform resources, and their values MUST be placed by a dispatched workflow through the environment's deploy role; NEVER from a workstation. Placing a secret is Tier 3.

- **Why:** a workstation placement leaves the value in shell history and is invisible to review (gencast ADR-015 §6.2; [autonomy-bar](../agent-conventions/autonomy-bar.md) Tier 3, secret placement).
- **Reference:** GenCast `.github/workflows/place-secrets.yml` (key-mode guard, 15-minute timeout, prod enable flag); runbook `docs/runbooks/staging-deploy-and-place-secrets.md`.
- **Enforced by:** review.

### SEC-04 · Deploy credentials never enter a session

Deploy credentials MUST NEVER be stored in a cloud environment or a session; deploys run in GitHub Actions through OIDC (AWS-02).

- **Why:** a session credential with deploy rights bypasses the pipeline (FL-6 item 1; [cloud-environment](../cloud-environment.md)).
- **Reference:** [cloud-environment](../cloud-environment.md) "Deploy credentials never go here."
- **Enforced by:** review; `standards-check AWS-02` for the workflow side.

### SEC-05 · No environment's ids in another's build

Build output, tfvars and served files MUST NOT carry another environment's identifiers (pool ids, price ids, account ids).

- **Why:** staging once shipped built against the dev Cognito pool and dev Stripe prices (existing convention: `docs/agent-conventions/verification-checks.md` When each check is required, release smoke).
- **Reference:** `scripts/checks/env-leak-scan.js`; GenCast `scripts/deploy/frontend-dev-id-guard.py`.
- **Enforced by:** `env-leak-scan.js` in release smoke.

### SEC-06 · Secrets stay out of code, fixtures and logs

Code, fixtures, `.env.example`, `checks.json` and logs MUST NOT contain a real secret; live-test credentials come from environment variables through the check's `loginScript`.

- **Why:** a committed value is public to every clone forever (existing convention: `agents/devops-engineer.md` Tooling standards; `agents/code-reviewer.md` Security; `docs/agent-conventions/verification-checks.md` live-test credentials).
- **Reference:** `scripts/checks/ux-sweep.js` `loginScript` reads env vars.
- **Enforced by:** review.

## Proposed (needs owner)

- **Verify a placed secret with a live call that never echoes it** (`curl -K` config file, HTTP status only). GenCast `place-secrets.yml` verify step.
- **Modules never manage access keys, login profiles, MFA devices or signing certificates**, so no key id enters state. Platform FA-FR-10, FA-FR-15.
- **Customer PII files in a dedicated private bucket served only by 15-minute pre-signed GETs**, never through a CDN. drinkupapp D-029.
