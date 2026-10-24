# Q-43 inventory: website moves out of the management account

Status: DRAFT for Code Reviewer and Platform PM review. Phase 1 of Q-43: docs and config only, no AWS writes, no applies.
Date: 2026-10-24. Author: DevOps (website).

Authority: WS-6 (extended 2026-10-24T10:27:14Z, chat), WS-7 (one `website-staging` account and one `website-prod` account), WS-8 (the `ericreilly.com` zone moves to the platform account, with delegated subzones or narrow record roles).

Evidence base: the `.tf` files and modules in `terraform/`, `.github/workflows/deploy.yml`, plus read-only AWS calls in management account `290993374431` (`sts get-caller-identity`, `s3api get-object` on the state key, `cloudfront list-distributions` and `get-distribution-config`, `route53 list-resource-record-sets`, `iam list-roles` / `get-role`, `lambda get-function-configuration`, `apigateway get-rest-apis`). No write call of any kind was made. Nothing in this file contains a secret.

## 1. Headline findings

1. The Terraform in `terraform/` owns only part of what the website runs on. **Not in Terraform state (console-created, unmanaged):** the whole `prompted` site (2 S3 buckets, 2 CloudFront distributions, 1 ACM cert, 2 deploy roles), the contact-form backend (Lambda `contact-form-prod`, API Gateway `contact-form-api-prod` id `k7cpfmv07e`, role `contact-form-lambda-role-prod`, SES verified identities), and about 11 Route 53 records in the zone. These must be inventoried, recreated and moved. Missing any of them breaks a live page.
2. The contact form URL is hard-coded in `public/contact.html` and `prompted/index.html` as `https://k7cpfmv07e.execute-api.us-east-1.amazonaws.com/prod/contact`. Moving the API changes that URL, which is an application-code change (out of scope for this phase). Recommendation: introduce a custom domain (for example `api.ericreilly.com`) first, repoint the pages to it, then move the backend behind the stable name.
3. The Lambda runtime is `nodejs16.x`, which is end of life. Recreate it on a supported runtime in the new account rather than copying it.
4. The apex `ericreilly.com` cannot be moved between CloudFront distributions in different accounts without the source distribution being disabled (AWS doc "Move the alternate domain name": the wildcard method excludes apex domains; cross-account `update-domain-association` requires the source disabled). So **apex and www cannot be strictly zero downtime** by moving the alias. The runbook gives options. This needs an owner decision on an accepted outage window (T3-2 below).
5. The CloudFront origin is the S3 **website endpoint** over HTTP (`ericreilly.com-prod.s3-website-us-east-1.amazonaws.com`, no OAC). There is no OAC today. The new stack should keep the same origin pattern for parity in the first move; OAC hardening is a separate backlog item (B-Q43-07).
6. The prod buckets are **not versioned**, and the deploy does `aws s3 sync --delete`. The cutover therefore needs a content deploy into the new bucket from the release tag, and the old bucket must stay untouched until the rollback window closes.
7. The `drinkup-staging-route53-reader` role in the management account trusts the drinkup-staging deploy role, `user/drinkup-devops` and the drinkup-staging account root, and exists to read this zone. It is platform-owned, but it breaks silently when the zone moves unless platform recreates an equivalent role.
8. State comparison (brief item 5) is in section 6: the local state files are stale copies.

## 2. Inventory

All rows are in management account `290993374431` today. Targets: `W-stg` = website-staging, `W-prod` = website-prod, `Platform` = platform account (owner of the DNS zone). Move method: **recreate** = new resource in the target account from Terraform, old one removed after cutover. `terraform import` and `state mv` only work inside one account, so they apply to nothing that crosses accounts; every website-owned resource is therefore **recreate**. The old state is retired (`state rm`, then destroy) only after cutover and with owner approval.

### 2.1 Terraform-managed (remote state `website/terraform.tfstate`, 52 resource entries)

| Resource | File | Owner now | Target account | Move method | Downtime risk |
|---|---|---|---|---|---|
| S3 bucket `ericreilly.com-prod` plus public-access-block, ownership controls, SSE, website config, bucket policy (6) | `main.tf` -> `modules/static_site` | website | W-prod | recreate (bucket names are global, so the new bucket needs a new name; old bucket kept until the rollback window closes) | none (parallel stack) |
| CloudFront distribution `EU0P2OBAYXZSI` (aliases `ericreilly.com`, `www.ericreilly.com`) | `main.tf` -> `modules/static_site` | website | W-prod | recreate | **apex alias move needs the source disabled: minutes of outage unless Support-assisted** (finding 4) |
| ACM cert `756e2d67-...` (apex + www SAN), `aws_acm_certificate_validation` | `main.tf` -> `modules/certificate_zone` | website | W-prod | recreate (certs cannot move accounts) | none |
| ACM validation CNAMEs (2) | same | website content, platform zone | Platform zone, written by W-prod via record role | recreate | none |
| Route 53 zone `Z09302003LDW15NJ86V5W` (`prevent_destroy`) | same | **platform** (WS-8) | Platform | platform's decision: new zone plus registrar NS change, or a zone-ID-preserving approach. Not a website decision. | **highest-risk step in the program**: registrar NS change, see runbook section 3 |
| apex A, apex AAAA, www A (3 records) | `main.tf` -> `modules/dns_aliases` | website content, platform zone | Platform zone via record role | recreate in the new zone (www has no AAAA today) | flips at cutover |
| IAM OIDC provider (GitHub) | `main.tf` -> `modules/github_deploy` | **shared** (also trusted by `prompted-site-deploy-*`; only one allowed per account) | one provider in each of W-stg and W-prod | recreate | none |
| Role `eric-reilly-website-prod-deploy`, policy, attachment (3) | same | website | W-prod | recreate (trust `environment:production`, S3 sync + CloudFront invalidation on the new bucket/distribution only) | none |
| ACM cert for `staging.ericreilly.com`, its validation record and validation resource | `staging.tf` | website | W-stg | recreate | none |
| Bucket `ericreilly.com-staging` (6 bucket resources) and CloudFront `E2RCBOAESLBYM1` | `staging.tf` -> `modules/static_site` | website | W-stg | recreate (new bucket name) | none |
| `staging_alias_a`, `staging_alias_aaaa` | `staging.tf` | website content, platform zone | delegated subzone `staging.ericreilly.com` in W-stg (or record role) | recreate | brief, staging only |
| Role `eric-reilly-website-staging-deploy`, policy, attachment (3) | `staging.tf` | website | W-stg | recreate (trust `environment:staging`, own OIDC provider) | none |
| 9 outputs and 19 `moved` blocks | `main.tf`, `staging.tf` | website | n/a | the `moved` blocks record an earlier refactor; drop them in the new roots (fresh state) | none |

### 2.2 Terraform-managed DNS records that belong to other projects (platform-owned now)

All are `aws_route53_record` in this repo's state against `module.certificate_zone.zone_id`. They are not website resources. They go with the zone and belong in platform-owned code (or each owning project's repo with a record role). Remove them from website state only after platform confirms they exist in its code.

| Resource | File | Owner now | Target | Method | Downtime risk |
|---|---|---|---|---|---|
| `gencast_ses_dkim` (3 CNAMEs, `*._domainkey.gencast.ericreilly.com`) | `ses-gencast.tf` | platform (GenCast SES) | Platform zone code | carry/recreate | mail auth fails (DKIM) if missing at the NS flip; load before the change |
| `drinkup_staging_ses_dkim` (3), `_mail_from_mx`, `_mail_from_spf`, `_sending_spf`, `_dmarc` (SES for `mail.ericreilly.com`, drinkup-staging account `208937957023`) | `ses-drinkup-staging.tf` | platform (DrinkUp) | Platform zone code | carry/recreate | same; DrinkUp is scaled to zero so lower impact |
| `drinkup_sendgrid_return_path`, `_dkim_s1`, `_dkim_s2`, `_dmarc` (SendGrid for `ericreilly.com`) | `sendgrid-drinkup.tf` | platform (DrinkUp SendGrid) | Platform zone code | carry/recreate | same; apex `_dmarc` affects every sender on the apex |
| `picks_site_acm_validation` (CNAME), `picks_site_alias_a`, `picks_site_alias_aaaa` (-> `d2pw617i58c5iw.cloudfront.net`, odds-analysis account `102429470155`) | `picks-site-dns.tf` | platform (odds-analysis, `picks.ericreilly.com`) | Platform zone code | carry/recreate | `picks.ericreilly.com` is live; load before the change |

### 2.3 Live in AWS, NOT in Terraform state (found by read-only calls)

| Resource | Owner | Target | Method | Downtime risk |
|---|---|---|---|---|
| Prompted prod: S3 `prompted.ericreilly.com` (unversioned), CloudFront `E2USR2V7OHNC2I`, ACM `7b75c9d5-...` | website | W-prod | recreate under Terraform using `static_site` (S3 website origin, parity) | alias flip for `prompted.ericreilly.com`; non-apex, so the wildcard move method is available |
| Prompted staging: S3 `staging.prompted.ericreilly.com`, CloudFront `E2KX0Q5EAQS7Q6` (uses the same cert `7b75c9d5-...`; confirm its SAN list) | website | W-stg | recreate | brief, staging only |
| Roles `prompted-site-deploy-prod` / `-staging`; OIDC trust lists both `ericreilly999/website` and `ericreilly999/prompted-tech-talks-site` | website, shared with the other repo | W-prod / W-stg | recreate in Terraform; confirm whether the other repo still deploys through them before carrying that trust | none |
| Contact form: Lambda `contact-form-prod` (nodejs16.x, env keys `TO_EMAIL`, `FROM_EMAIL`), role `contact-form-lambda-role-prod` (logs + `ses:SendEmail`/`SendRawEmail` on `*`), API Gateway `contact-form-api-prod` (`k7cpfmv07e`, stage `prod`). Staging has no separate backend: both environments call the prod API. | website | W-prod | recreate on a supported runtime, SES permission scoped to the verified identity | contact form breaks unless the pages are repointed (finding 2) |
| SES verified identities for two Gmail addresses (us-east-1) | website (contact form) | W-prod | re-verify in the new account (mailbox owner clicks the link); check sandbox state | form silently fails until verified |
| About 11 zone records not in this repo's state: `staging.drinkup` / `api.staging.drinkup` / `assets.staging.drinkup` and a validation CNAME, `dev.gencast` A/AAAA and validation, `dev.drinkupapp` validation, `prompted` and `staging.prompted` A/AAAA and validation CNAMEs, apex `_f15a...` validation CNAME | other projects, plus website (prompted) | Platform zone | carried with the zone; platform diffs `list-resource-record-sets` before and after | a missed record is an outage for that name |
| Role `drinkup-staging-route53-reader` | platform / DrinkUp | Platform | recreate in the platform account | DrinkUp Terraform plans fail until done |

### 2.4 Shared or outside this repo's remit

| Resource | Owner | Note |
|---|---|---|
| S3 `ericreilly-website-tfstate` and DynamoDB `ericreilly-website-tfstate-lock` | website (bootstrap script, not Terraform) | stays in the management account until the last apply there, then retired; the new accounts get their own backends |
| Management-account OIDC provider `token.actions.githubusercontent.com` | shared by website, prompted and ai-assistant roles | do not touch; platform decides cleanup after all consumers move |
| `PlatformOwnerAdmin`, `FleetCostRead` and other roles | platform | not website |

## 3. Proposed repo layout

```
terraform/
  modules/
    static_site/          reused as is (bucket + CloudFront); OAC later
    certificate/          NEW, split out of certificate_zone: ACM cert + validation records only
    dns_aliases/          reused; takes a provider alias for the zone account
    github_deploy/        reused; create_oidc_provider = true in each new account
    contact_form/         NEW: Lambda + API Gateway + role + SES identity (prod only)
  envs/
    staging/              W-stg: main.tf (module calls only), variables.tf, outputs.tf, backend.tf, terraform.tfvars
    prod/                 W-prod: same shape
  legacy/                 current terraform/*.tf frozen, used only until cutover is done, then deleted
  bootstrap-backend.sh    generalised with an account/profile parameter
```

Rules carried from the DevOps standard: `main.tf` in each env calls modules only (no `resource` blocks); every variable has description and type; tags `Project`, `Environment`, `ManagedBy`; `terraform fmt` and `validate` before PR. The current root violates the no-resource-blocks rule (`staging.tf`, `picks-site-dns.tf`, the SES and SendGrid files); the new layout fixes that as a side effect.

Remote state per environment, in its own new account:

- Bucket `<project>-tfstate-<account-id>`, versioning on, SSE, public access block, us-east-1.
- Key `website/<env>/terraform.tfstate`.
- Locking: S3 native locking (`use_lockfile = true`, Terraform >= 1.10; the local toolchain is 1.14.7) instead of a DynamoDB table, one less resource per account. Set `required_version >= 1.10`. If platform standardises on DynamoDB it is a one-line change.
- The state bucket is created by a bootstrap step in each new account, not by the env root it stores state for.

DNS handling (recommended split, to confirm with Platform):

- **Delegated subzones for non-apex names**: `staging.ericreilly.com` and `staging.prompted.ericreilly.com` delegated to zones in W-stg; `prompted.ericreilly.com` delegated to a zone in W-prod. Platform holds only the NS delegation records. ACM validation and alias records then stay inside the website account and the env roots need no cross-account provider.
- **Narrow record role for the apex**: `ericreilly.com` and `www.ericreilly.com` cannot be delegated. W-prod assumes a platform role through a second provider (`provider "aws" { alias = "dns" ... assume_role }`) whose policy allows `route53:ChangeResourceRecordSets` on the platform zone only, with `route53:ChangeResourceRecordSetsNormalizedRecordNames` limited to `ericreilly.com`, `www.ericreilly.com` and the ACM validation CNAME names, and `route53:ChangeResourceRecordSetsRecordTypes` limited to `A`, `AAAA`, `CNAME`; plus `ListResourceRecordSets`, `GetChange`, `GetHostedZone` on that zone. Trust: the W-prod deploy/apply role and the operator role only.
- The mail and partner records in section 2.2 live in platform code, not in the website roots.

### 3.1 Needs from platform

1. **Account IDs** for `website-staging` and `website-prod` (WS-7), plus the role DevOps assumes to bootstrap them (for example `OrganizationAccountAccessRole` from the management/platform account). Any new write principal is a decision card (T3-1).
2. **GitHub OIDC provider** in each account, or permission for the website root to create it (default: the website root creates it; if platform prefers to own it, the module takes `create_oidc_provider = false` plus the ARN).
3. **DNS shape per hostname**: confirm the subzone delegation list (platform creates NS records and takes the subzone name servers from the website) and the **narrow record role ARN** for the apex and www with the conditions in section 3.
4. **Zone ID and name servers** of the new `ericreilly.com` zone as soon as it exists, and all 42 current record sets (including the roughly 11 not in website state) loaded **before** any NS change. The registrar NS change is Platform's.
5. **ACM validation path**: subzone delegation (preferred, nothing needed) or a record role that allows `_*.ericreilly.com` CNAME writes.
6. **Replacement for `drinkup-staging-route53-reader`** in the platform account, and a statement of who owns each record group in section 2.2 afterwards.
7. **SES decision** for the contact form in W-prod: verified identities and sandbox exit, or a platform-owned sender.
8. **Org guardrails**: any SCP that blocks CloudFront, ACM (us-east-1), API Gateway, Lambda or IAM OIDC provider creation in the new OUs.
9. **Registrar plan**: who changes NS, when, and the TTL pre-lowering schedule.

## 4. Workflow plan (no workflow file changed in this PR)

### 4.1 Audit gaps in `.github/workflows/deploy.yml` today

| # | Gap | Fix in the new workflows |
|---|---|---|
| 1 | No `timeout-minutes` on any of the 6 jobs | `timeout-minutes` on every job: 5 for PR checks, 15 for deploys and e2e |
| 2 | Workflow-level `concurrency` group `deploy-${{ github.ref }}` with `cancel-in-progress: true` applies to deploys, so a new push cancels an in-flight `s3 sync --delete` and can leave a half-updated site | per-job groups `deploy-<env>` with `cancel-in-progress: false` for deploys; `true` only for PR checks |
| 3 | Prod deploys on any pushed `vX.Y.Z` tag with no check that the tag has a sign-off | `workflow_dispatch` only, input `tag`; verify tag exists and the sign-off record for its SHA before deploying |
| 4 | Staging deploys on every push to main | dispatch-only per the brief. CLAUDE.md route-to-live currently says continuous staging; the PM must reconcile CLAUDE.md in the implementation PR, or the owner chooses to keep a `workflow_run` trigger after PR Checks |
| 5 | Hard-coded values: account ID `290993374431` in two role ARNs, distribution IDs `EU0P2OBAYXZSI`, `E2KX0Q5EAQS7Q6`, `E2USR2V7OHNC2I`, bucket names inside `run:` steps | per-environment `vars.*` (`AWS_ROLE_ARN`, `S3_BUCKET`, `CF_DIST_ID`, `PROMPTED_S3_BUCKET`, `PROMPTED_CF_DIST_ID`, `SITE_URL`, `PROMPTED_URL`, `AWS_REGION`) |
| 6 | `STAGING_DEPLOY_ROLE_ARN` is a secret though a role ARN is not sensitive; prod ARN inline | environment variable |
| 7 | `id-token: write` at workflow level; only `pr-checks` narrows it, so `e2e-staging` inherits it needlessly | top-level `contents: read`; `id-token: write` on deploy jobs only |
| 8 | Actions pinned to major tags (`@v4`, `configure-aws-credentials@v4`) | pin to commit SHAs on the jobs holding AWS roles |
| 9 | Prompted deploy jobs are separate from the main site and not covered by e2e | one workflow per environment; the prompted site is a job gated the same way; e2e covers both hostnames |
| 10 | No gate between staging and prod (no required green staging e2e on the same SHA, no verifier sign-off) | prod dispatch refuses without a PASS sign-off for the tag SHA |
| 11 | `s3 sync --delete` on unversioned prod buckets; rollback means rebuilding | enable versioning in the new module; rollback = re-dispatch the previous tag |
| 12 | No release-smoke step and no deployment-log entry | add the release-smoke checks and emit a line for `.project/deployment-log.md` |
| 13 | Staging rewrites the prompted link with `sed` after the build | make the prompted base URL a build-time input |
| 14 | `npm test` repeated inside each deploy job | one test job per workflow, ahead of deploy |

### 4.2 Target shape

- `deploy-staging.yml`: `workflow_dispatch`, input `ref` (default `main`); job with `environment: staging`; OIDC into the W-stg role from `vars.AWS_ROLE_ARN`; build, sync both sites, invalidate, e2e against `vars.SITE_URL`; `timeout-minutes: 15`; `concurrency: deploy-staging`, no cancel.
- `deploy-prod.yml`: `workflow_dispatch`, input `tag`; verify tag and sign-off; check out the tag; build; OIDC into the W-prod role; sync; invalidate; release smoke; `environment: production` with a required reviewer; `timeout-minutes: 15`; `concurrency: deploy-prod`, no cancel.
- `pr-checks.yml`: keep the job name `PR Checks` (it is the required status check; renaming deadlocks branch protection), `contents: read`, `timeout-minutes: 5`, cancel-in-progress per PR.
- `terraform-plan.yml` on PR for `terraform/envs/**` (read-only role per account) and `terraform-apply.yml` dispatch-only per environment, gated on a plan with zero destroys and zero replacements (the guard counts destroy/replace, not total changes). Staging and prod applies go through the pipeline only.
- OIDC trust: `repo:ericreilly999/website:environment:staging` in W-stg and `repo:ericreilly999/website:environment:production` in W-prod, `aud = sts.amazonaws.com`. Do not carry the `prompted-tech-talks-site` repo into the new roles unless it is confirmed still in use.

## 5. Order of work after this PR

1. Platform delivers section 3.1.
2. DevOps bootstraps state in W-stg, builds `envs/staging`, plan then pipeline apply. Staging cutover rehearses the runbook.
3. Contact-form custom domain and page repoint (application-code change).
4. DevOps builds `envs/prod` in parallel without production aliases; validation through the `*.cloudfront.net` name.
5. Platform moves the zone; the website flips alias records.
6. Retire the legacy stack with owner approval (prod destroy outside P-7/P-10 is Tier 3).

## 6. Local state leftovers (brief item 5)

Read-only comparison, run 2026-10-24 with the management root key (state fetched with `s3api get-object` into a scratch directory, not written to the repo):

| | Remote `s3://ericreilly-website-tfstate/website/terraform.tfstate` | Local `terraform.tfstate` | Local `terraform.tfstate.backup` |
|---|---|---|---|
| Size / modified | 115,300 bytes, 2026-09-24T12:38:20Z | **0 bytes**, 2026-04-18 | 47,383 bytes, 2026-04-18 |
| Terraform version | 1.14.7 | n/a (empty) | 1.14.7 |
| Serial | 14 | n/a | 21 |
| Lineage | `e9b7706e-b186-d681-2149-e0981222d4bc` | n/a | `d3866755-c42a-8279-c025-9a9b8add323d` |
| Resource entries | 52 | 0 | 21 |

Result: the lineages differ and the backup's serial (21) is higher than the remote's (14), so they are different state histories (the backup predates the S3 backend; the remote was built from a fresh lineage). Every resource address in the backup also exists in the remote state, and the remote has 31 more (staging, SES, SendGrid, picks records, module-path versions). `terraform/.terraform/terraform.tfstate` points at the S3 backend. `website.tfplan` is dated 2026-03-28, before the backend and every file after `main.tf`, so it can never apply against current state.

Conclusion: the remote backend holds the real state. The local `terraform.tfstate` is empty, and `terraform.tfstate.backup` and `website.tfplan` are stale copies. Nothing was deleted. Never push either over the remote (lineage mismatch). The old backup could hold old attribute values; not inspected beyond metadata. Deletion of the three files is part of T3-5.

## 7. Tier-3 items needing an owner decision card

| Id | Question |
|---|---|
| T3-1 | New write principals: OIDC providers and deploy roles in W-stg and W-prod, the cross-account DNS record role, and the DevOps assume-role path into the new accounts. |
| T3-2 | Accepted outage window for the apex and www alias move (estimated 5 to 15 minutes, off-peak) versus the Support-assisted route (finding 4). |
| T3-3 | Contact form: introduce a custom API domain first (small page change), or accept a URL change and repoint the pages in the cutover release. |
| T3-4 | SES identities for the contact form in W-prod: re-verify the two Gmail addresses (the owner must click the verification emails). |
| T3-5 | Decommission of the management-account stack after cutover (prod destroys outside P-7/P-10) and deletion of the local state leftovers. |

## 8. Backlog

Repo-side items are B-Q43-01 to B-Q43-07 at the top of `.project/backlog.md`.
