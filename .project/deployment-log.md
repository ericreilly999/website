# Deployment Log

Deployments are recorded in reverse-chronological order.

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
