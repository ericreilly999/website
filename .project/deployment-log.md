# Deployment Log

Deployments are recorded in reverse-chronological order.

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
