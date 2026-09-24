# Deployment Log

Deployments are recorded in reverse-chronological order.

---

## 2026-09-24 — Alias A/AAAA records for `picks.ericreilly.com` (odds-analysis handoff, phase 2 of 2 — final)

**What:** Added `aws_route53_record.picks_site_alias_a` and `aws_route53_record.picks_site_alias_aaaa` in the shared `ericreilly.com` zone (`module.certificate_zone.zone_id`, `Z09302003LDW15NJ86V5W`), extending `terraform/picks-site-dns.tf`. Both alias `picks.ericreilly.com` → `d2pw617i58c5iw.cloudfront.net` (alias zone `Z2FDTNDATAQYW2`), `evaluate_target_health = false`. Completes the OA-17 DNS handoff started in PR #22 (phase 1, ACM validation CNAME).

**Why:** Final step making `picks.ericreilly.com` resolve to the odds-analysis CloudFront distribution now that its ACM certificate is issued and the hostname is registered as a CloudFront alternate domain name.

**Authorization:** Fleet Decisions page, collection `decisions`, doc `OA-17` (artifact `https://claude.ai/artifact/AgEqZELaoLFLbCaWLqQUMS`). `answer.decided_by_owner === true`, `decided_at: "2026-09-23T15:16:39Z"`, `status: "approved"`. Same authorization as phase 1; the approved plan names this exact record.

**Sequencing gate (why this waited a day after phase 1):** The alias could not go live before CloudFront accepted `picks.ericreilly.com` as an alternate domain with an ISSUED cert, or visitors would get a certificate/hostname mismatch. Readiness was checked directly (no cross-account creds needed) by resolving `d2pw617i58c5iw.cloudfront.net` and running `curl --resolve picks.ericreilly.com:443:<ip> https://picks.ericreilly.com/`, polled every ~10 minutes:
- `2026-09-24T12:26:31Z` (initial) and `2026-09-24T12:26:55Z` (poll loop) — TLS handshake failed: `SEC_E_WRONG_PRINCIPAL` (cert did not yet cover this SNI). **Not ready.**
- `2026-09-24T12:36:55Z` — TLS succeeded, `HTTP:200`. **Ready.** Independently re-confirmed at `2026-09-24T12:37:16Z` against two different resolved CloudFront IPs (`99.84.252.2`, `99.84.252.72`), both `HTTP:200`.

**Method:** PR [#23](https://github.com/ericreilly999/website/pull/23), `ops/picks-alias-dns` → `main`. `terraform plan` showed exactly `2 to add, 0 to change, 0 to destroy` both when the PR was opened and again immediately before apply (re-run to guard against state drift during the wait) — only these two records, no existing prod/staging resource touched. `PR Checks` passed. Squash-merged by DevOps under the config-only exception (**GC-7**, human-approved 2026-09-20, precedent PRs #18/#19/#22) once the readiness check cleared — merge commit `f90bcb3ccc197f467c99059e1d7cd079bb8dec1a`. `terraform apply` run against the saved plan (`picks-site-alias.tfplan`) immediately after merge: `Apply complete! Resources: 2 added, 0 changed, 0 destroyed.`

**Verification:**
- `aws route53 list-resource-record-sets --hosted-zone-id Z09302003LDW15NJ86V5W` — both `picks.ericreilly.com` A and AAAA alias records present, targeting `d2pw617i58c5iw.cloudfront.net.` / `Z2FDTNDATAQYW2`, exactly as specified.
- Public A record: `nslookup picks.ericreilly.com 8.8.8.8` and `nslookup picks.ericreilly.com 1.1.1.1` both resolve to the expected CloudFront IPs.
- Public AAAA record: confirmed authoritatively against the zone's own nameserver (`Resolve-DnsName -Type AAAA -Server ns-1643.awsdns-13.co.uk` → 8 IPv6 addresses). At verification time, `8.8.8.8`/`1.1.1.1` still returned `NXDOMAIN` for the AAAA query specifically — a stale negative-cache artifact from before the record existed (zone `SOA` TTL is 900s/15min), not an infrastructure problem; the A query against the same two resolvers for the same name succeeded, and the record is confirmed correct at the authoritative source. Expected to clear within the SOA TTL window.
- `curl -sSI https://picks.ericreilly.com/` (no `--resolve`) → `HTTP/1.1 200 OK`, served via CloudFront (`X-Cache: Hit from cloudfront`, `Server: AmazonS3`).

**Status:** ✅ Live. `picks.ericreilly.com` now resolves publicly to the odds-analysis CloudFront distribution and serves over HTTPS with a valid certificate. OA-17 DNS handoff (both phases) complete from this repo's side.

---

## 2026-09-23 — ACM DNS validation CNAME for `picks.ericreilly.com` (odds-analysis handoff, phase 1 of 2)

**What:** Added `aws_route53_record.picks_site_acm_validation` — a single CNAME in the shared `ericreilly.com` zone (`module.certificate_zone.zone_id`, `Z09302003LDW15NJ86V5W`) — new file `terraform/picks-site-dns.tf`. Record: `_b3754202b86b096610d47972dee49a02.picks.ericreilly.com.` → `_0b52c853550f59e3f26b2a3124b1b791.wzccmgtwzk.acm-validations.aws.`, TTL 60.

**Why:** The sibling `odds-analysis` project is standing up a new CloudFront site on `picks.ericreilly.com`. Its ACM certificate lives in the odds-analysis AWS account (102429470155), but the `ericreilly.com` public hosted zone lives in this repo's account (290993374431), so the DNS validation record has to be added here — same pattern as `ses-gencast.tf`.

**Authorization:** Fleet Decisions page, collection `decisions`, doc `OA-17` (artifact `https://claude.ai/artifact/AgEqZELaoLFLbCaWLqQUMS`). Verified directly: `answer.decided_by_owner === true`, `decided_at: "2026-09-23T15:16:39.280Z"`, `status: "approved"`. Cross-checked against `odds-analysis` repo's own `.project/deployment-log.md` DNS-handoff entry (~lines 1901-1927) — both sources agreed on record name/value/TTL.

**Method:** PR [#22](https://github.com/ericreilly999/website/pull/22), `devops/picks-site-acm-validation-dns` → `main`. `terraform plan` showed exactly `1 to add, 0 to change, 0 to destroy` (only this record — no existing prod/staging resource touched). `PR Checks` passed. Self-merged by DevOps under the config-only exception (**GC-7**, human-approved 2026-09-20, precedent PRs #18/#19) — squash merge commit `084f4635b2b25ea2a8175f59cfc61d652cfc769c`. `terraform apply` run against the saved plan (`picks-site-dns.tfplan`) immediately after merge: `Apply complete! Resources: 1 added, 0 changed, 0 destroyed.` Change-batch/apply id: `picks-site-dns-2026-09-23`.

**Verification:** `aws route53 list-resource-record-sets --hosted-zone-id Z09302003LDW15NJ86V5W` confirms the record exists exactly as specified (Name/Type/TTL/Value all match).

**Certificate status — not checked from here (by design):** Attempted `aws acm describe-certificate --certificate-arn arn:aws:acm:us-east-1:102429470155:certificate/6b7629eb-c765-4599-95be-c40300112849`. This repo's session is scoped to account 290993374431 (confirmed via `aws sts get-caller-identity`); the call correctly failed with `ResourceNotFoundException` against that account, since the certificate lives in the odds-analysis account (102429470155). No cross-account role was created to force this, per scope. odds-analysis's own DevOps session needs to confirm `ISSUED` status from within their own account.

**Scope note — phase 2 NOT done here:** The alias A/AAAA record (`picks.ericreilly.com` → `d2pw617i58c5iw.cloudfront.net`, zone `Z2FDTNDATAQYW2`) is deliberately not added yet. Per OA-17's own recorded outcome, that alias waits until (a) the odds-analysis cert shows `ISSUED` and (b) odds-analysis flips `picks_site_enable_custom_domain = true` and re-applies on their side to register the hostname as a CloudFront alternate domain name. Adding the alias before that would produce a certificate/hostname mismatch for anyone resolving the hostname.

**Status:** ✅ CNAME live in DNS. Phase 2 (alias record) blocked on odds-analysis's own cert-issuance + apply — out of this repo's hands.

---

## 2026-09-22 — PR status check live: `PR Checks` job added to `deploy.yml` + branch protection `contexts` populated (CLD-14 item 1 follow-up, Fleet Decisions `WS-3`)

**Two changes, logged together because neither is meaningful alone:**
1. **Code** — PR [#21](https://github.com/ericreilly999/website/pull/21), `chore/pr-status-check` → `main`, squash merge commit `d5c7ebff289fa83880e584256d42f7634e4fb648`. Adds a `pull_request` trigger and one new job, `PR Checks`, to `.github/workflows/deploy.yml` (+57/-0, single file).
2. **Out-of-band GitHub settings mutation** — `gh api PUT /repos/ericreilly999/website/branches/main/protection`, moving `required_status_checks.contexts` from `[]` to `["PR Checks"]`. Identical rule set to the "Branch protection enabled on `main`" entry below in every other field.

**Why:** closes the follow-up that entry recorded explicitly — *"the next CLD-14 item that touches `deploy.yml` should add a `pull_request`-triggered check (lint/test job) before this rule set can meaningfully require a status check."* Until now `contexts` was necessarily empty: `deploy.yml` triggered only on `push`, so no job had ever reported a status on a PR, and requiring one would have deadlocked every PR on a check that structurally never runs. Human-approved as Fleet Decisions item `WS-3` (`answer.decided_by_owner: true`, `decided_at: 2026-09-22T15:58:39.172Z`), verified directly via `ArtifactData` rather than via a relay.

### The job

`pr-checks` / `name: PR Checks` — checkout → setup-node → `npm ci` → `npm test` → job summary. No build, no S3 sync, no CloudFront invalidation, no `aws-actions/configure-aws-credentials`, no `environment:` binding.

Three independent layers keep a PR from ever touching AWS:
- Job-level `permissions: {contents: read}` **replaces** (does not merge with) the workflow-level `permissions: {id-token: write}`; unlisted scopes become `none`. Confirmed on the wire — the run log shows `Contents: read` / `Metadata: read` and **no `ID Token` line**.
- No `environment:` binding, so no environment secrets are in scope.
- The trigger is `pull_request`, **not** `pull_request_target` — fork PRs get a read-only token and no secrets. (Code Reviewer flagged `pull_request_target` as what would have been the one BLOCKING finding had it been used.)

`npm test` is the repo's existing script, already used as a pre-build step in `deploy-staging` / `deploy-prod`. No new lint tool was introduced — `package.json` has no lint script.

### Decision: no `paths:` filter on the `pull_request` trigger

The `push` trigger's `paths:` allowlist (CLD-14 item 2) is untouched and byte-identical to its prior state. The new `pull_request` trigger deliberately carries no filter. The load-bearing distinction, confirmed in review:

- A job skipped by an `if:` guard **still emits a check-run** with conclusion `skipped` — and GitHub's branch protection counts `skipped` as passing.
- A workflow skipped by a **path filter never starts at all**, so no check-run is ever created, and protection waits forever on a required status that can never arrive.

So path-filtering a *required* check would deadlock any PR touching no listed path — e.g. a `.project/`-only or docs-only PR. A docs-only PR burning one sub-minute runner job is the cheaper failure mode by a wide margin.

### Decision: job name is load-bearing

`PR Checks` is the literal string in `required_status_checks.contexts`. Renaming the job silently breaks protection — the old context stays required and never reports again, deadlocking every subsequent PR. A comment above the job in `deploy.yml` records this. Do not rename without updating the protection rule in the same change.

### Local validation (before push, per CI discipline)

A structural harness parsed HEAD's and the branch's `deploy.yml` with the repo's own `yaml` parser and asserted 26 properties — all passed: `push` trigger serialises byte-identical to HEAD; `pull_request.branches == ["main"]` with no `paths`/`paths-ignore`; job name exactly `PR Checks`; guard `github.event_name == 'pull_request'`; `permissions == {contents: read}`; no `environment`; job body free of `aws-actions/`, `secrets.`, `aws s3`, `cloudfront`, `npm run build`, `role-to-assume`; each of the five pre-existing jobs deep-equals its HEAD definition; exactly one job added. `npm test` also run locally. Code Reviewer independently re-derived the same claims with its own 20-assertion harness.

### Live proof (the point of opening a PR for this at all)

On PR #21's own head SHA `3165be16aa43d567d5eaf6973ca4636b491523e8`:

| Check | Conclusion |
|---|---|
| `PR Checks` | **success** (26s) |
| `Deploy Staging` | skipped |
| `Deploy Prompted Staging` | skipped |
| `E2E Tests (Staging)` | skipped |
| `Deploy Production` | skipped |
| `Deploy Prompted Production` | skipped |

All five pre-existing jobs remain guarded on `github.ref` (`refs/heads/main` or `refs/tags/v*`); on a PR `github.ref` is `refs/pull/N/merge`, matching neither, and `e2e-staging` is doubly guarded via `needs:`. Staging and production deploy behaviour is unchanged.

**Post-merge push run** (merge landed inside the `push` paths allowlist, so it deployed): `Deploy Staging`, `Deploy Prompted Staging`, `E2E Tests (Staging)` all `success`; both prod jobs correctly skipped; `PR Checks` correctly **skipped on the push event**, confirming its `if:` guard doesn't burn a runner outside PRs.

### Rule set now in force on `main` (re-GET verified, not assumed)

```json
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["PR Checks"],
    "checks": [{ "app_id": 15368, "context": "PR Checks" }]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": false,
    "require_code_owner_reviews": false,
    "required_approving_review_count": 0
  },
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_linear_history": false,
  "lock_branch": false
}
```

`app_id: 15368` is GitHub Actions — the context is bound to the Actions app, so an unrelated integration cannot satisfy it by posting a same-named status. Every other field is unchanged from the earlier entry; only `contexts` moved.

### Code Reviewer

Verdict **APPROVED**, merged by Code Reviewer per this solo-author repo's established pattern (GitHub rejects self-approval; `ericreilly999` is the only collaborator — CLD-13 / PR #17 precedent). Comment: https://github.com/ericreilly999/website/pull/21#issuecomment-5780346521 — 0 BLOCKING, 1 WARNING, 4 SUGGESTION.

The WARNING was that the protection update was not in the PR diff, leaving a green check with zero enforcement until `contexts` was set — **closed by change 2 of this entry**, with the specific over-reach it warned about (adding the deploy job names, which report `skipped` and therefore count as *passing*, producing a gate that enforces nothing) deliberately avoided: `contexts` contains `PR Checks` and nothing else.

Open SUGGESTIONs, none blocking, not actioned here:
- `npm test` is a near-no-op — thin assertion surface. Worth real unit coverage now that a gate exists to run it.
- Record the no-paths-filter rationale in `.project/decisions.md` so a future CI-minutes optimisation doesn't re-add a filter and deadlock the repo.
- Consider `actionlint` in the PR job.
- Consider `npm ci --ignore-scripts` as fork hardening.

### Process note — reviewer dispatched on the wrong model tier, corrected mid-flight

The first Code Reviewer was dispatched on Sonnet per the standing fleet default. That default is overridden by Fleet Decisions `FP-3` (human-approved, `decided_by_owner: true`, `decided_at: 2026-09-22T15:43:20.636Z`), which scopes **all** agent dispatches — reviewer dispatches explicitly included — to Opus until 21:00 ET 2026-09-22. `FP-3` was verified directly via `ArtifactData`, not taken from the relay. The Sonnet reviewer was stood down before taking any GitHub write action (no comment, no approval, no merge — confirmed in its own report) and a replacement was dispatched on Opus, which performed the review and owned the merge. No duplicate review comment and no merge race resulted.

### Tooling note for future reviews

`mcp__github__get_pull_request_status` reported `state: pending, total_count: 0` on a fully-green PR — it reads the legacy commit-status API, which GitHub Actions does not write to. The check-runs API (`gh pr checks` / `/commits/{sha}/check-runs`) is the authoritative source for this repo. Taking that MCP tool at face value would block a ready PR, or worse, train a future session to ignore a real red check.

---

## 2026-09-22 — Infra hygiene: `prevent_destroy` guards, prod tag-guard tightening, state-backend tagging (CLD-14 item 3 — DEVOPS-04/05/06)

**Method:** PR [#19](https://github.com/ericreilly999/website/pull/19), `chore/infra-hygiene-devops-04-05-06` → `main`. Self-merged by DevOps after local validation (config-only exception GC-7, human-approved 2026-09-20) — squash merge commit `d858c59dc27d444d6829a86db6c098512dc02b9d`. Code Reviewer post-merge comment: https://github.com/ericreilly999/website/pull/19#issuecomment-5780059084 (verdict: sound, no BLOCKING findings; one WARNING — the missing deployment-log entry, which this entry closes — plus two low-stakes SUGGESTIONs).

**Why:** Closes the three reviewer-warning follow-ups logged as DEVOPS-04/05/06 under "Post-merge follow-ups (reviewer warnings — scope separately)" in `.project/TODO.md`. Final item of Linear epic CLD-14 "Ops & maintenance backlog".

**One PR, not three:** the four touched files are disjoint, all three changes are guard-rail/tagging hygiene in the same risk class (no application code, no new resources, no spend change, no IAM change), and they share one review pass and one CI run.

---

### DEVOPS-04 — `prevent_destroy` lifecycle guards

Added `lifecycle { prevent_destroy = true }` to `aws_s3_bucket.website` and `aws_cloudfront_distribution.website` (`terraform/modules/static_site/main.tf`) and `aws_route53_zone.website` (`terraform/modules/certificate_zone/main.tf`).

**⚠️ NO `terraform apply` WAS RUN — AND NONE IS NEEDED.** A prod-affecting apply is Tier 3, so the code was landed and the apply deliberately not executed. But the apply turns out to be unnecessary rather than merely deferred: `lifecycle` is a **plan-time configuration construct and is not persisted in Terraform state**, so the guard is live for anyone planning from this code the moment it merged. Verified by `terraform plan` against the real remote state after the edits: `No changes. Your infrastructure matches the configuration.` Independently confirmed by Code Reviewer as correct by Terraform's design. **No `WS-` apply item needs to be queued for DEVOPS-04.**

**Staging is guarded too — forced by Terraform, not a scope decision.** The run brief scoped this to the three prod resources and said not to touch staging. `terraform/staging.tf` was **not** modified. However `modules/static_site` is instantiated twice (`module.static_site` = prod, `module.staging_static_site` = staging), and `prevent_destroy` [only accepts literal values](https://developer.hashicorp.com/terraform/language/meta-arguments/lifecycle) — lifecycle settings are evaluated during dependency-graph construction, before expressions can be resolved — so it cannot be gated behind a per-environment variable, and `lifecycle` is not a valid meta-argument on a `module` block either. Guarding the prod bucket/distribution therefore necessarily guards the staging ones. This is additive safety: it blocks destroy/replace only and alters no resource attribute. Cost: a future change that *forces replacement* of the staging bucket or distribution (e.g. renaming the staging bucket) will error until the block is removed — a deliberate, reviewed one-line change. Code Reviewer independently confirmed the constraint is real and that no better alternative was missed. Recorded here so a future session doesn't read a staging `prevent_destroy` error as a bug.

**Validation (all read-only, nothing applied):** `terraform fmt -check -recursive` exit 0 no diff; `terraform validate` success; `terraform plan` no changes **and zero pre-existing drift across the whole config**. Guards proven to actually fire via a **plan-only** destroy simulation (`terraform plan -destroy`, no apply) → `Error: Instance cannot be destroyed ... module.static_site.aws_cloudfront_distribution.website has prevent_destroy set`. The destroy graph walks CloudFront first and aborts there, so the bucket and zone guards were additionally confirmed structurally (each target resource block parsed and asserted to contain `prevent_destroy = true`).

### DEVOPS-05 — tightened prod tag guards (defence-in-depth)

`.github/workflows/deploy.yml`, jobs `deploy-prod` and `deploy-prompted-prod`: `startsWith(github.ref, 'refs/tags/')` → `startsWith(github.ref, 'refs/tags/v')`. The `on.push.tags` trigger is already `'v[0-9]+.[0-9]+.[0-9]+'`, so this changes **no job-run behaviour today**; it makes the second, independent check match the trigger's intent rather than being looser than it, so the guard still holds if the trigger pattern is ever loosened upstream. `on.push.paths` (CLD-14 item 2, PR #18) and the three `refs/heads/main` staging guards were **not** touched.

**Local validation** (can't be tested by pushing a junk tag — that's the thing the guard exists to stop): (1) YAML parsed with `js-yaml`, parsed tree dumped to confirm the trigger pattern, the path filter and all five job guards; (2) a truth table over 11 sample refs evaluating the trigger pattern and both old and new guard. Result: all real semver tags (`v0.1.8`, `v1.2.3`, `v10.20.30`) still pass — **no prod-deploy regression**; six non-semver shapes (`latest`, `prod`, `release-2026-09`, `backup-before-migration`, `staging-snapshot`, `1.2.3`) flip from permitted to blocked at the guard, all of them already blocked by the trigger.

**Residual gap, deliberately accepted:** `refs/tags/v1.2.3-rc1` still passes `startsWith(..., 'refs/tags/v')`. GitHub Actions expressions have no regex, so this is the strictest primitive available and the guard cannot fully mirror the trigger's semver pattern. Code Reviewer confirmed the gap is real but practically unreachable — GitHub's tag-trigger pattern is anchored glob matching and this workflow has no non-`push` trigger. The trigger remains the precise check.

### DEVOPS-06 — Terraform state-backend resources tagged (**out-of-band mutation — executed against live resources**)

**This is an out-of-band mutation trace** per `~/.claude/docs/agent-conventions/artifact-rules.md`. The tagging below was applied by direct AWS CLI from a workstation, outside any tracked deploy pipeline.

**What changed:** `ericreilly-website-tfstate` (S3) and `ericreilly-website-tfstate-lock` (DynamoDB, `arn:aws:dynamodb:us-east-1:290993374431:table/ericreilly-website-tfstate-lock`) — the Terraform remote-state backend, created 2026-04-18 — were tagged `Project=eric-reilly-website`, `ManagedBy=bootstrap-script`, `Purpose=terraform-state-backend`. They were the only untagged resources in the account's website footprint.

**When:** 2026-09-22, immediately before this entry was written.

**Why:** DEVOPS-06. These two resources hold the remote state itself, so they must exist before Terraform does and are necessarily outside its management (chicken-and-egg) — they cannot be tagged by a `terraform apply`. `ManagedBy` is deliberately `bootstrap-script` rather than the Terraform-standard `terraform`: tagging them `terraform` would be actively misleading, since no Terraform config manages them. Key/value style otherwise mirrors `local.common_tags` in `terraform/main.tf` so the backend groups with the Terraform-managed resources in Cost Explorer and the Tag Editor.

**Why this was safe to execute directly (not Tier 3):** additive and idempotent, no data or availability impact, and these are shared tooling infra — **not** the prod content-serving S3 bucket / CloudFront distribution / Route 53 zone that the Tier-3 carve-out covers. Explicitly authorized in the run brief.

**How:** by running the updated `terraform/bootstrap-backend.sh` end-to-end (which also re-exercised and confirmed its "safe to re-run — all operations are idempotent" contract: both existing resources were correctly detected and skipped for creation, and only the tag calls took effect). The new `aws s3api put-bucket-tagging` and `aws dynamodb tag-resource` calls sit **outside** the create-if-absent branches so re-running always refreshes tags — confirmed by Code Reviewer. `bash -n` syntax check passes.

**Pre-state (verified, not assumed):** `aws s3api get-bucket-tagging` → `NoSuchTagSet: The TagSet does not exist`; `aws dynamodb list-tags-of-resource` → `{"Tags": []}`. Both genuinely untagged.

**Post-state (verified):**
```
$ aws s3api get-bucket-tagging --bucket ericreilly-website-tfstate
{"TagSet":[{"Key":"Project","Value":"eric-reilly-website"},
           {"Key":"Purpose","Value":"terraform-state-backend"},
           {"Key":"ManagedBy","Value":"bootstrap-script"}]}

$ aws dynamodb list-tags-of-resource \
    --resource-arn arn:aws:dynamodb:us-east-1:290993374431:table/ericreilly-website-tfstate-lock
{"Tags":[{"Key":"Project","Value":"eric-reilly-website"},
         {"Key":"ManagedBy","Value":"bootstrap-script"},
         {"Key":"Purpose","Value":"terraform-state-backend"}]}
```

---

**Post-merge pipeline verification:** this PR touched `deploy.yml`, which is in the CLD-14 item 2 path allowlist, so it correctly re-triggered a staging run — run [35753361363](https://github.com/ericreilly999/website/actions/runs/35753361363) on `d858c59`: `Deploy Staging` ✅, `Deploy Prompted Staging` ✅, `E2E Tests (Staging)` ✅, `Deploy Production` / `Deploy Prompted Production` correctly `skipped` (no tag pushed — confirms the tightened guard did not break the skip path).

**Reviewer follow-ups closed:** the one WARNING (missing out-of-band mutation trace) is closed by this entry, committed as `3dfe3da`. The two SUGGESTIONs — tag-key parity wording in `bootstrap-backend.sh`, and a comment noting that `on.push.tags` rather than the `if:` guard is what blocks pre-release tags — are closed by PR [#20](https://github.com/ericreilly999/website/pull/20), squash-merged `fc322bd34d0f0322dcf0b37eefc00b62c0fe7623` (comment-only, zero functional change; both `if:` guards and `on.push.paths` byte-identical). PR #20 also touched `deploy.yml` so it re-triggered staging — run [35754158584](https://github.com/ericreilly999/website/actions/runs/35754158584): `Deploy Staging` ✅, `Deploy Prompted Staging` ✅, `E2E Tests (Staging)` ✅, both prod jobs correctly `skipped`.

**Path-filter regression check (incidental):** the tracking-file-only commit `3dfe3da` (`.project/` only) triggered **no** workflow run, re-confirming CLD-14 item 2's path filter still behaves correctly in the negative direction.

---

## 2026-09-22 — `deploy.yml` staging trigger path-filtered (CLD-14 item 2)

**Method:** PR #18, `chore/deploy-workflow-path-filter` → `main`. Self-merged by DevOps after local validation (config-only exception GC-7, human-approved 2026-09-20) — squash merge commit `0d946dbc17c443db08c389d6bc001a7bda56f393`. Code Reviewer post-merge comment: https://github.com/ericreilly999/website/pull/18#issuecomment-5779619273 (verdict: sound, one non-blocking WARNING, no BLOCKING findings).

**Why:** Docs-only/tracking-file-only pushes to `main` (e.g. `.project/` commits) were re-triggering and cancelling in-flight staging deploys via the shared `deploy-${{ github.ref }}` concurrency group — fired twice during CLD-13 Stage 3 closeout earlier today. See `.project/workflow-state.md` "Stage 4 — COMPLETE" note.

**Change:** Added a `paths:` allowlist (`public/**`, `prompted/**`, `package.json`, `package-lock.json`, `.github/workflows/deploy.yml`) to the top-level `on.push:` block. Chose allowlist over `paths-ignore:` denylist — fails safe, since a future new top-level path defaults to NOT triggering a deploy unless added, matching this repo's actual S3-synced surface. `src/` (legacy React app, unused by `npm run build`) deliberately excluded — confirmed by Code Reviewer directly reading `package.json`'s build script.

**Tag-push (production) trigger verified unaffected:** GitHub Actions does not evaluate path filters for tag pushes at all, even combined with `branches:`/`tags:` in one `on.push:` block (GitHub's own workflow-syntax docs: "Path filters are not evaluated for pushes of tags"). Verified independently by DevOps before merge and re-verified independently by Code Reviewer post-merge (cross-checked against GitHub community discussions #26273/#27194). `deploy-prod`/`deploy-prompted-prod` continue to run on every matching `vX.Y.Z` tag regardless of paths changed.

**Local validation before merge:** YAML parsed with the repo's own `yaml` devDependency — no syntax errors, `on.push` fields and all 5 jobs present as expected. `npm test` green (no unit-test suite by design).

**Post-merge verification (this PR touched `deploy.yml` itself, which is in the allowlist, so it correctly re-triggered a staging run to validate the pipeline change):** run [35749677304](https://github.com/ericreilly999/website/actions/runs/35749677304) — `Deploy Staging` ✅, `Deploy Prompted Staging` ✅, `E2E Tests (Staging)` ✅, `Deploy Production`/`Deploy Prompted Production` correctly `skipped` (no tag pushed).

**Known non-blocking follow-up (Code Reviewer finding):** `e2e/**` and `playwright.config.js` are not in the allowlist. Since `e2e-staging` runs `needs: deploy-staging` inside the same workflow, an E2E-spec-only push to `main` no longer triggers the workflow at all — this matches the task's explicit instruction that `e2e/**` is non-deployable and should not trigger a redeploy, but as a side effect new/changed E2E specs won't get exercised against live staging until an unrelated deployable change ships alongside them. Flagged to PM for a decision (not actioned this dispatch — outside this task's scope, and adding it would need PM/QA input on whether that trade-off is acceptable).

---

## 2026-09-22 — Branch protection enabled on `main` (out-of-band GitHub settings change, CLD-14)

**Method:** `gh api` REST (`PUT /repos/ericreilly999/website/branches/main/protection`) — GitHub repo settings, not Terraform (this repo's application infra is separate from its GitHub repo settings).
**Why:** Closes the open risk logged in `.project/project-status.md` ("No branch protection on `main` — unreviewed pushes can go live") and the backlog item in `.project/TODO.md` ("Enforce branch protection on `main`"). Part of Linear epic CLD-14.

**Pre-check (verified, not assumed):**
- `GET .../branches/main/protection` → `404 Branch not protected` (no prior rule existed).
- `GET .../collaborators` → exactly one collaborator, `ericreilly999` (role `admin`). `GET .../installations` → `404 Not Found`. Confirmed: **no bot/second-reviewer path exists on this repo.**
- Read `.github/workflows/deploy.yml` `on:` block: triggers are `push` to `main` and semver tags **only** — there is **no `pull_request` trigger** anywhere in the repo's one workflow file (`deploy.yml` is the only file in `.github/workflows/`). This means the job names `Deploy Staging`, `Deploy Prompted Staging`, `E2E Tests (Staging)` never run in a PR context today — only after a push already lands on `main`.

**Rule set applied:**
```json
{
  "required_status_checks": { "strict": true, "contexts": [] },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": false,
    "require_code_owner_reviews": false,
    "required_approving_review_count": 0
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
```
Plain English: PRs are required to merge into `main`; no approving review is required (see below); the PR branch must be up to date with `main` before merge (addresses the PR #10 stale-base conflict class noted in `lessons-learned.md`); force-pushes and branch deletion on `main` are blocked; repo admins can bypass the PR requirement (`enforce_admins: false`).

**Required-approving-review count: deliberately set to 0 (excluded), not omitted by oversight.**
This is a solo-author repo — `ericreilly999` is the only collaborator, and GitHub rejects self-approval on a PR you authored. A prior Code Reviewer dispatch on this repo already hit that wall and fell back to posting findings as PR comments instead of a formal approval. Requiring ≥1 approval with no second reviewer available would deadlock every future PR merge with no escape hatch. `required_approving_review_count: 0` still enables "require a pull request before merging" (contra my working assumption at the top of this task, GitHub's classic protection API does accept 0 — verified empirically via the PUT call below) without demanding a review nobody can give.

**Required status checks: deliberately left empty (`contexts: []`), not populated with the deploy.yml job names — this deviates from the dispatch's default suggestion, flagging back per its own "verify yourself" instruction.**
The task's default suggestion was to require `Deploy Staging` / `Deploy Prompted Staging` / `E2E Tests (Staging)`. Verification (above) showed `deploy.yml` has no `pull_request` trigger, so none of those jobs ever report a status on a PR — they only fire after a push to `main` has already happened. Requiring status checks that structurally never run on a PR would leave every future PR stuck in "expected, never started" indefinitely — the same deadlock class as the self-approval problem, just via a different mechanism. So `contexts` is empty for now; `strict: true` (require branches up to date) is still enabled since that has independent value and no dependency on a PR-triggered workflow. **Follow-up needed:** the next CLD-14 item that touches `deploy.yml` (explicitly out of scope for this dispatch) should add a `pull_request`-triggered check (lint/test job) before this rule set can meaningfully require a status check. Recording this as a prerequisite, not closing it silently. **CLOSED 2026-09-22** — see the `PR Checks` entry at the top of this file: PR #21 (merge `d5c7ebff289fa83880e584256d42f7634e4fb648`) added the `pull_request`-triggered `PR Checks` job, and `required_status_checks.contexts` is now `["PR Checks"]`.

**"Require pull request before merging" vs. established direct-to-main `.project/` tracking-file commits — surfaced explicitly, not silently overridden.**
This project's established practice (per `.project/workflow-state.md` history and this file's own entries) has PM/QA/DevOps committing `.project/*` and `lessons-learned.md` tracking updates directly to `main`, outside a PR. GitHub's classic branch-protection API has no path-scoped "require PR for these paths only" mechanism — "require pull request before merging" is all-or-nothing per branch. Rather than let a literal "require PR" setting silently strand that established pattern, I set `enforce_admins: false`. `ericreilly999` is the repo's sole collaborator and holds `admin` role, and it's the identity every agent pushes as — so the admin bypass means direct `.project/`-only commits (like this one) can continue exactly as before, while the PR requirement is live for the general case. This is a real tradeoff (an admin bypass on a solo-author repo means "require PR" is not actually enforced against the one identity that does all the pushing) — recording it so a future session doesn't read "branch protection enabled" as "direct pushes are now blocked." Direct pushes by `ericreilly999` are still technically possible; the intent going forward is that **code** changes go through a PR (for the diff visibility / Code Reviewer comment trail this unlocks) while tracking-file-only commits keep using the existing direct-push pattern.

**Verification (re-GET after PUT, confirms live state matches applied rule set):**
```json
{
  "required_status_checks": {"strict": true, "contexts": [], "checks": []},
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": false,
    "require_code_owner_reviews": false,
    "require_last_push_approval": false,
    "required_approving_review_count": 0
  },
  "required_signatures": {"enabled": false},
  "enforce_admins": {"enabled": false},
  "required_linear_history": {"enabled": false},
  "allow_force_pushes": {"enabled": false},
  "allow_deletions": {"enabled": false},
  "block_creations": {"enabled": false},
  "required_conversation_resolution": {"enabled": false},
  "lock_branch": {"enabled": false},
  "allow_fork_syncing": {"enabled": false}
}
```
Matches the applied rule set exactly. **Status:** ✅ Live on `main`.

---

## 2026-09-21 — v0.1.8 — Production

**Deployed by:** GitHub Actions (tag push, `deploy.yml`, run [35675110707](https://github.com/ericreilly999/website/actions/runs/35675110707))
**Tag:** `v0.1.8` (annotated), created at `main` SHA `77951eb4ec0cb4b058ee8ab972e488bbebd4fa62` (tag object SHA `641c99408c7f51c16b70adb098615a96a3e7ab02`)
**Bundled content:** Light/dark theme toggle — PR #17 (CLD-13), merged to `main` as `b23d4a9`. `main` has only received docs/PM-tracking commits since (`.project/project-status.md`, `.project/test-signoff.md`, `.project/workflow-state.md`, `lessons-learned.md` — zero application-code drift, verified via `git diff --stat b23d4a9 77951eb`). Straight promotion of already-staging-validated code, no new commits.
**Staging QA sign-off (pre-tag):** 95/95 — all green, live against `staging.ericreilly.com`, recorded in `.project/test-signoff.md` (commit `68f10c2`)
**Human approval:** On record — Fleet Decisions page, id WS-2, `decided_by_owner: true`, decided 2026-09-21T16:57:51Z
**Environment:** Production — https://ericreilly.com and https://prompted.ericreilly.com (prompted site)
**Jobs:**
- `Deploy Production` — ✅ success
- `Deploy Prompted Production` — ✅ success
- `Deploy Staging` / `Deploy Prompted Staging` / `E2E Tests (Staging)` — skipped (tag push, not a `main` push; expected)
**Status:** ✅ Live

---

## 2026-09-14 — v0.1.7 — Production

**Deployed by:** GitHub Actions (tag push, `deploy.yml`, run [34795972197](https://github.com/ericreilly999/website/actions/runs/34795972197))
**Tag:** `v0.1.7` (annotated), created at `main` SHA `861910f`
**Bundled content:** Round 6 content — PR #15 (hero sub-paragraph ending reordered to "a portfolio of PE-backed SaaS products."; bio opener trimmed to "These days, I'm standardizing reliability across a big SaaS portfolio."), on top of everything already shipped in `v0.1.6`
**Staging QA sign-off (pre-tag):** 74/74 — all green, recorded in `.project/test-signoff.md`
**Human approval:** Explicit — "ship to prod immediately"
**Environment:** Production — https://ericreilly.com and https://prompted.ericreilly.com (prompted site)
**Jobs:**
- `Deploy Production` — ✅ success
- `Deploy Prompted Production` — ✅ success
- `Deploy Staging` / `Deploy Prompted Staging` / `E2E Tests (Staging)` — skipped (tag push, not a `main` push; expected)
**Post-deploy verification (read-only curl spot-check):**
- `https://ericreilly.com` — hero sub-paragraph ends "a portfolio of PE-backed SaaS products." ✅; bio opens "These days, I'm standardizing reliability across a big SaaS portfolio." ✅
**Status:** ✅ Live

---

## 2026-09-13 — v0.1.6 — Production

**Deployed by:** GitHub Actions (tag push, `deploy.yml`, run [34763317301](https://github.com/ericreilly999/website/actions/runs/34763317301))
**Tag:** `v0.1.6` (annotated), created at `main` SHA `e4001237d1e4bb01e2bd3b739e48f2aa3fad56ab`
**Bundled content:** 5 content rounds — PRs #11, #12, #13, #14 (CTA copy tweak "get in touch to work with me" was the final round, PR #14)
**Staging QA sign-off (pre-tag):** 31/31, 58/58, 62/62, 73/73 — all green, recorded in `.project/test-signoff.md`
**Human approval:** Explicit — "I think this is good to ship to production"; PM confirmed tag SHA and proposed `v0.1.6` (prior prod tag `v0.1.5`)
**Environment:** Production — https://ericreilly.com and https://prompted.ericreilly.com (prompted site)
**Jobs:**
- `Deploy Production` — ✅ success (35s)
- `Deploy Prompted Production` — ✅ success (13s)
- `Deploy Staging` / `Deploy Prompted Staging` / `E2E Tests (Staging)` — skipped (tag push, not a `main` push; expected)
**Post-deploy verification (read-only curl spot-check):**
- `https://ericreilly.com` — "Work with me" hero CTA ✅; "Reduced Sev 1 incidents by over 70%" ✅; "Appointed platform owner for an international core banking SaaS" ✅; "I build stuff that scales" ✅ (capitalized; text split across a `<span class="token">` tag in markup); "Claude Code, Codex, Kiro, Python, Bash" (AI & automation skills) ✅
- `https://ericreilly.com/contact` — meta description updated: "Work with me: SRE and cloud architecture consulting via White Glove Solutions." ✅
- `https://ericreilly.com/projects` — "work with me" prose present ✅
**Status:** ✅ Live

---

## 2026-04-18 — Staging environment provisioned (Terraform)

**Method:** `terraform apply` (automated via PM)
**Resources created:** S3 bucket `ericreilly.com-staging`, CloudFront distribution `E2RCBOAESLBYM1`, ACM certificate for `staging.ericreilly.com`, Route 53 A/AAAA records, IAM role `eric-reilly-website-staging-deploy`
**Terraform state:** Migrated from local to S3 remote backend (`ericreilly-website-tfstate`)
**GitHub Actions:** Secret `STAGING_DEPLOY_ROLE_ARN` and variable `STAGING_CF_DIST_ID` set
**Status:** ✅ Infrastructure live — staging deploy will trigger on next push to `main`

---

## 2026-04-04 — v0.1.4 ��� Production

**Deployed by:** GitHub Actions (tag push)
**Commit:** 274f784 — "Refresh portfolio content and project storytelling"
**Environment:** Production — https://ericreilly.com
**S3 Bucket:** ericreilly.com-prod
**CloudFront Distribution:** EU0P2OBAYXZSI
**Status:** ✅ Live
**QA Sign-Off:** None on record

---

## 2026-03-28 — v0.1.1–v0.1.3 — Production (CI fixes)

**Deployed by:** GitHub Actions (tag pushes)
**Commits:** abdb653, ade570c, e0d67ad — CI/CD stabilisation (lockfile, yaml dep, optional build files)
**Environment:** Production
**Status:** ✅ Live
**Notes:** Series of small CI fixes following initial infrastructure setup.

---

## 2026-03-28 — v0.1.0 — Production (initial IaC deployment)

**Deployed by:** GitHub Actions (first tag push after Terraform IaC setup)
**Commit:** 15a4d75 — "Add Terraform-managed website infrastructure"
**Environment:** Production — https://ericreilly.com
**Status:** ✅ Live
**Notes:** First deployment with Terraform-managed infrastructure. IAM resources imported; OIDC deploy role active.

---

## 2026-03-23 — Pre-tag (manual / recovered)

**Method:** Manual S3 sync from recovered build
**Source:** `s3://ericreilly.com-prod` (recovered-build/)
**Status:** ✅ Was live prior to this repo being established
**Notes:** Baseline. Source recovered into `src/`. All subsequent deployments go through GitHub Actions.
