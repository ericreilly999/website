# Backlog — website

> Owned by Requirement Analyst. Curated by PM at retros. See `~/.claude/docs/agent-conventions/backlog.md`.
> Q-43 items below were added by DevOps on 2026-10-24 from the phase 1 inventory (`docs/migration/q43-inventory.md`). Milestone `M7` is a proposed new milestone ("Website runs in dedicated AWS accounts"); the PM adds it to `.project/milestones.md`.

---

## Q-43: bootstrap remote state and build the staging root in the website-staging account

- **ID**: B-Q43-01
- **Type**: Infra
- **Status**: Backlog
- **Estimate**: M
- **Milestone**: M7
- **Created**: 2026-10-24 by DevOps
- **Source**: Q-43; owner decisions WS-6 (extended 2026-10-24T10:27:14Z), WS-7, WS-8
- **Spec link**: `docs/migration/q43-inventory.md` section 3
- **Outcome**: staging.ericreilly.com and staging.prompted.ericreilly.com run from Terraform in their own account, with state in that account.
- **Acceptance**:
  - `terraform/envs/staging` with module calls only, remote state bucket (native lock) in the new account
  - prompted staging site brought under Terraform (currently console-created)
  - plan shows zero destroys; applied through the pipeline only
  - blocked on: platform delivering account IDs, assume-role path and DNS shape (inventory section 3.1; owner card T3-1)

## Q-43: build the prod root (site, prompted, contact form) in the website-prod account

- **ID**: B-Q43-02
- **Type**: Infra
- **Status**: Backlog
- **Estimate**: L
- **Milestone**: M7
- **Created**: 2026-10-24 by DevOps
- **Source**: Q-43; inventory section 2.3 (unmanaged prompted site, contact-form Lambda/API Gateway/SES)
- **Spec link**: `docs/migration/q43-inventory.md` sections 2 and 3
- **Outcome**: a complete parallel prod stack exists and is validated through its CloudFront domain without taking any production alias.
- **Acceptance**:
  - `terraform/envs/prod` plus new `contact_form` and `certificate` modules
  - contact-form Lambda on a supported runtime; SES permission scoped to the verified identity
  - versioning enabled on the new prod buckets
  - release smoke passes against the CloudFront domain

## Q-43: replace deploy.yml with dispatch-only staging and prod workflows

- **ID**: B-Q43-03
- **Type**: Infra
- **Status**: Backlog
- **Estimate**: M
- **Milestone**: M7
- **Created**: 2026-10-24 by DevOps
- **Source**: Q-43; workflow audit gaps in `docs/migration/q43-inventory.md` section 4.1
- **Spec link**: `docs/migration/q43-inventory.md` section 4
- **Outcome**: deploys use OIDC roles in the new accounts, cannot be cancelled mid-sync, and refuse a tag without a sign-off.
- **Acceptance**:
  - `timeout-minutes` and per-environment `concurrency` (no cancel) on every job
  - no hard-coded account, bucket or distribution identifiers (environment variables)
  - the required status check name `PR Checks` is unchanged
  - CLAUDE.md route-to-live updated in the same PR (PM reconciles the staging trigger)

## Q-43: give the contact form a stable API domain before the backend moves

- **ID**: B-Q43-04
- **Type**: Tech debt
- **Status**: Backlog
- **Estimate**: S
- **Milestone**: M7
- **Created**: 2026-10-24 by DevOps
- **Source**: Q-43 finding 2: `contact.html` and `prompted/index.html` hard-code the API Gateway URL (owner card T3-3)
- **Spec link**: not yet speced
- **Outcome**: moving the contact backend between accounts does not require a page release.
- **Acceptance**:
  - custom domain for the API; both pages call it
  - contact.html and prompted/index.html add a visually hidden `website` honeypot input (tabindex -1, autocomplete off) and send it in the JSON body; the Lambda already drops non-empty values silently (added with the Q-43 follow-ups). API stage throttling (burst 10, 2 rps) is unchanged. Needs an E2E case for the hidden field.
  - form submission verified live on staging and prod

## Q-43: execute the cutover (staging, then prod site, then DNS)

- **ID**: B-Q43-05
- **Type**: Infra
- **Status**: Backlog
- **Estimate**: L
- **Milestone**: M7
- **Created**: 2026-10-24 by DevOps
- **Source**: Q-43; `docs/migration/q43-cutover-runbook.md` (DRAFT)
- **Spec link**: `docs/migration/q43-cutover-runbook.md`
- **Outcome**: ericreilly.com, www, prompted and staging hostnames are served from the new accounts and the platform zone, with rollback proven.
- **Acceptance**:
  - platform review of the runbook is complete and the draft banner removed
  - outage window for the apex alias move decided (owner card T3-2)
  - mail and partner records (GenCast, DrinkUp, SendGrid, picks) verified unchanged before and after the NS change

## Q-43: decommission the management-account stack and local state leftovers

- **ID**: B-Q43-06
- **Type**: Tech debt
- **Status**: Backlog
- **Estimate**: S
- **Milestone**: M7
- **Created**: 2026-10-24 by DevOps
- **Source**: Q-43; owner card T3-5
- **Spec link**: `docs/migration/q43-inventory.md` section 6
- **Outcome**: nothing of the website remains in account 290993374431 and no stale state files can mislead a future session.
- **Acceptance**:
  - old stack removed after the rollback window, with owner approval
  - old state bucket and lock table retired
  - the three stale local files (`terraform.tfstate`, `.backup`, `website.tfplan`) deleted with the owner's go-ahead

## Q-43 follow-up: origin access control and bucket versioning for the static sites

- **ID**: B-Q43-07
- **Type**: Risk
- **Status**: Backlog
- **Estimate**: M
- **Milestone**: later
- **Created**: 2026-10-24 by DevOps
- **Source**: Q-43 findings 5 and 6: CloudFront uses the public S3 website endpoint over HTTP; prod buckets are unversioned
- **Spec link**: not yet speced
- **Outcome**: the buckets are no longer publicly readable and a bad deploy can be rolled back by object version.
- **Acceptance**: TBD at spec time (note the S3 website endpoint serves the extensionless `about`/`projects`/`contact` objects; confirm the replacement handles them)

---

## Done

## Cancelled
