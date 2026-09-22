# Deployment Log

Deployments are recorded in reverse-chronological order.

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
The task's default suggestion was to require `Deploy Staging` / `Deploy Prompted Staging` / `E2E Tests (Staging)`. Verification (above) showed `deploy.yml` has no `pull_request` trigger, so none of those jobs ever report a status on a PR — they only fire after a push to `main` has already happened. Requiring status checks that structurally never run on a PR would leave every future PR stuck in "expected, never started" indefinitely — the same deadlock class as the self-approval problem, just via a different mechanism. So `contexts` is empty for now; `strict: true` (require branches up to date) is still enabled since that has independent value and no dependency on a PR-triggered workflow. **Follow-up needed:** the next CLD-14 item that touches `deploy.yml` (explicitly out of scope for this dispatch) should add a `pull_request`-triggered check (lint/test job) before this rule set can meaningfully require a status check. Recording this as a prerequisite, not closing it silently.

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
