# Review Checklists

Apply the relevant checklist(s) for every PR. Mark each item as ✅ pass, ❌ blocking, ⚠️ warning, or N/A.

---

## Application Code Checklist

### Correctness
- [ ] Implementation matches the spec (FR-XX requirements) exactly
- [ ] No behaviour present that wasn't specced — scope creep is a blocking issue
- [ ] All acceptance criteria from the spec are demonstrably met
- [ ] Edge cases defined in the spec are handled
- [ ] Error handling is explicit — no silent catch blocks, no unhandled promise rejections

### Testing
- [ ] QA Engineer's tests exist for this change and are referenced in the PR
- [ ] No new untested code paths introduced
- [ ] Tests are not trivially passing (not just testing mocks returning mocks)

### Security
- [ ] No hardcoded secrets, API keys, passwords, or tokens — BLOCKING
- [ ] No credentials in comments or commit messages — BLOCKING
- [ ] User input is validated and sanitised before use
- [ ] SQL queries use parameterised statements — no string interpolation into queries
- [ ] Auth checks enforced on all new endpoints/routes
- [ ] No sensitive data logged (PII, tokens, passwords)
- [ ] Dependencies added are from trusted sources and have no known critical CVEs

### Performance
- [ ] No N+1 query patterns (loops that trigger individual DB queries)
- [ ] No synchronous operations blocking the event loop unnecessarily
- [ ] No unbounded data fetches (missing pagination or limits)
- [ ] Caching considered where appropriate for expensive operations

### Code Quality
- [ ] No dead code, commented-out blocks, or leftover debug statements
- [ ] Functions are focused — single responsibility, not doing 5 things
- [ ] No magic numbers or strings — constants are named and explained
- [ ] Error messages are informative (not "something went wrong")
- [ ] No hardcoded environment-specific values (URLs, hostnames, feature flags)

### Dependencies
- [ ] New dependencies are justified — not adding a 200kb library for a 5-line utility
- [ ] `package.json` / `requirements.txt` / equivalent updated correctly
- [ ] No pinned versions that block security patches without explanation

---

## Terraform Checklist

The rules behind these items are `docs/standards/iac.md` (IAC-), `aws-access.md` (AWS-) and `secrets.md` (SEC-); cite the rule id in a BLOCKING finding.

### Module Architecture — BLOCKING if violated
- [ ] No `resource` blocks defined in root `main.tf` — all resources in modules
- [ ] Each module has a single, clear responsibility
- [ ] Modules are in `/modules/[name]/` with `main.tf`, `variables.tf`, `outputs.tf`
- [ ] Root `main.tf` only calls modules and passes variables
- [ ] Module inputs have `description` and `type` on every variable
- [ ] Module outputs have `description` on every output
- [ ] Sensitive outputs marked `sensitive = true`

### State Management
- [ ] Remote backend configured (S3 + DynamoDB locking) — no local state — BLOCKING
- [ ] State file path is environment-specific (no shared state across envs)
- [ ] `backend.tf` present and correctly configured

### Security
- [ ] No hardcoded AWS account IDs, AMI IDs, or region values — use variables
- [ ] No IAM policies with `"*"` for actions or resources without explicit justification — BLOCKING
- [ ] Least-privilege IAM — roles have only the permissions they need
- [ ] Security groups: no `0.0.0.0/0` ingress rules except on load balancers — BLOCKING
- [ ] All data encrypted at rest: S3 bucket encryption, RDS encryption, EBS encryption
- [ ] All traffic encrypted in transit: HTTPS enforced, no HTTP-only endpoints
- [ ] Secrets via AWS Secrets Manager — not SSM Parameter Store plaintext or hardcoded

### Tagging — WARNING if missing
- [ ] Every resource tagged with at minimum: `Project`, `Environment`, `ManagedBy=terraform`
- [ ] Tags defined as variables, not hardcoded per resource

### Formatting & Hygiene
- [ ] `terraform fmt` applied — consistent formatting throughout
- [ ] `terraform validate` passes
- [ ] No unused variables or outputs
- [ ] Variable validation rules added for constrained inputs (e.g. environment must be dev/staging/prod)

### Well-Architected — Cost Pillar
- [ ] Instance types appropriate for the workload — not over-provisioned
- [ ] Auto-scaling configured where applicable
- [ ] No always-on resources in dev that should be off-hours or on-demand

### Well-Architected — Reliability Pillar
- [ ] Multi-AZ for stateful resources (RDS, ElastiCache) in staging/prod
- [ ] Health checks configured on all services
- [ ] Backup/snapshot policies defined for stateful resources

### Well-Architected — Security Pillar
- [ ] Resources in private subnets where they don't need public access
- [ ] VPC flow logs enabled for production
- [ ] CloudTrail enabled for production

### Well-Architected — Performance Pillar
- [ ] CDN (CloudFront) for static assets
- [ ] Database connection pooling considered

---

## CI/CD Pipeline Checklist

The rules behind these items are `docs/standards/ci-cd.md` (CI-) and `testing.md` (GHM-); cite the rule id in a BLOCKING finding.

### Security
- [ ] All secrets via GitHub Secrets — no hardcoded values — BLOCKING
- [ ] Permissions scoped to minimum required (`permissions:` block present)
- [ ] No `pull_request_target` used without careful review (privilege escalation risk)

### Test Execution
- [ ] Pipeline runs the QA Engineer's test suite — not ad-hoc commands — BLOCKING
- [ ] Tests must pass before any deployment step runs
- [ ] Test results are uploaded as artifacts for inspection

### Security Scanning
- [ ] Checkov/tfsec runs on all Terraform changes
- [ ] Trivy runs on all container images and dependency manifests
- [ ] Semgrep runs on application code changes
- [ ] Critical/High findings block the pipeline — BLOCKING

### Branch & Deployment Gates
- [ ] Branch naming enforced: `feature/`, `defect/`, `chore/` prefixes only
- [ ] No direct push to `main` — PR required
- [ ] Deploy to dev: a path-filtered push to main, or `workflow_dispatch` (CI-01) ✅
- [ ] Deploy to staging: `workflow_dispatch` only, never a push or a tag (CI-01) ✅
- [ ] Deploy to prod: manual `workflow_dispatch` only ✅

### Reliability
- [ ] Workflow has `timeout-minutes` set — no infinite hanging jobs
- [ ] Retry logic or clear failure messages for flaky external dependencies
- [ ] Environment protection rules configured in GitHub for staging/prod

---

## Post-Review Comment Template

Use this to summarise the review as the final PR comment:

```markdown
## Code Review Summary

**Decision**: ✅ APPROVED | ❌ CHANGES REQUESTED

**Reviewer**: Code Reviewer Agent  
**Date**: [date]  
**PR**: #[N] — [title]

---

### Blocking Issues ([N])
> Must be resolved before merge.
- [ ] [Issue description — see inline comment]

### Warnings ([N])
> Should be resolved. Will not block merge.
- [ ] [Issue description]

### Suggestions ([N])
> Optional improvements.
- [ ] [Suggestion]

---

### Checklist Summary
| Category | Result |
|----------|--------|
| Spec compliance | ✅ / ❌ |
| Tests present | ✅ / ❌ |
| Security | ✅ / ⚠️ / ❌ |
| Terraform modules | ✅ / ❌ / N/A |
| CI/CD | ✅ / ❌ / N/A |
| Well-Architected | ✅ / ⚠️ / N/A |

---

[Any additional context or notes for the team]
```
