# AWS Multi-Account Architecture

Every project uses **account-per-environment** under a single AWS Organization. Non-negotiable. Enforced at Stage 0.

```
AWS Organization (management account — billing/governance only, no workloads)
├── {project}-dev       ← dev environment
├── {project}-staging   ← staging environment
└── {project}-prod      ← production environment
```

## Stage 0 Checklist — Account Setup

Run before invoking DevOps for infra.

1. **Check for existing Organization:**
   ```bash
   aws organizations describe-organization
   ```
   If none: `aws organizations create-organization --feature-set ALL`. Management account becomes billing/governance only.

2. **Create three member accounts** (sequential — AWS does not allow concurrent creation):
   - `{project}-dev` → email: `{owner}+{project}-dev@gmail.com`
   - `{project}-staging` → email: `{owner}+{project}-staging@gmail.com`
   - `{project}-prod` → email: `{owner}+{project}-prod@gmail.com`
   
   Use `aws organizations create-account` and poll until `State = SUCCEEDED`.

3. **Create cross-account IAM user** in the management account:
   - User: `{project}-devops`
   - Inline policy: `sts:AssumeRole` on `OrganizationAccountAccessRole` in all three member accounts
   - Create access keys; configure AWS CLI profile `{project}-devops`
   - Test:
     ```bash
     aws sts assume-role \
       --role-arn arn:aws:iam::{dev-account-id}:role/OrganizationAccountAccessRole \
       --role-session-name test \
       --profile {project}-devops
     ```

4. **Record all account IDs** in `.project/decisions.md` and the project's `CLAUDE.md`.

## Resolving account context (any agent)

Don't hand-copy account IDs from `.project/decisions.md` — resolve them live from the Organization, which also catches a missing/renamed member account:

```bash
python .claude/scripts/lib/aws_accounts.py resolve --project {project} [--profile {project}-devops]
# -> {"environments": {"dev": {"account_id","assume_role_arn",...}, "staging":..., "prod":...}, "missing": [...]}

python .claude/scripts/lib/aws_accounts.py whoami [--profile {project}-devops]      # sts get-caller-identity
python .claude/scripts/lib/aws_accounts.py assume-check --account-id <id> --profile {project}-devops
```

`assume-check` verifies the `OrganizationAccountAccessRole` assume path (the Stage-0 test below) and returns `{"assumable": bool, "detail": ...}`.

## Rules DevOps Must Follow

- All Terraform for `dev` targets account `{project}-dev` via assumed role
- All Terraform for `staging` targets `{project}-staging` via assumed role
- All Terraform for `prod` targets `{project}-prod` via assumed role
- Remote Terraform state lives in the **management account** S3 bucket (one central state bucket, paths scoped per project/environment)
- GitHub Actions OIDC roles are created in each member account separately
- Secrets Manager secrets are created in each member account separately — no cross-account secret sharing
- Root credentials are never used for workloads; IAM user or assumed role only

## What to Tell DevOps When Invoking

Always include in the DevOps handoff:
- Management account ID
- Dev account ID + assumed role ARN
- Staging account ID + assumed role ARN
- Prod account ID + assumed role ARN
- AWS CLI profile name (`{project}-devops`)
