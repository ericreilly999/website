# Milestones

> website (Eric Reilly personal site). Format and rules: `~/.claude/fleet/specs/milestone-tracking.md` §1 (`FL-10`). PM-owned from here on; first version written 2026-09-24 by Requirement Analyst (`.project/decisions.md`).
> Retrospective set for a live, maintenance-mode site: M1-M4 are reconstructed from evidence already in `.project/project-status.md`, `workflow-state.md`, `test-signoff.md`, `deployment-log.md` and `decisions.md` — every AC below is checked only where a real pointer (PR/merge SHA, deployment-log entry, QA sign-off) was found in those files, never on assertion.
> M1 predates this project's Linear onboarding (2026-03-28/04-18, Linear added 2026-09-19), so it carries no `Epics` line — no CLD issue was ever opened for it. M2-M4 map onto Linear epics `CLD-12`/`CLD-13`/`CLD-14`, all `[100%]`/`Done` per `workflow-state.md`'s 2026-09-23 completion-percentage check. M5 is a cross-project DNS handoff tracked as Fleet Decision `OA-17`, not a `website`-owned Linear epic — its `Epics` line names the decision id for traceability, not a CLD issue.
> No prose-round micro-tasks were ever added to `.project/TODO.md` (PM decision, noted in `project-status.md` "What's Coming Next") — M2's scope confidence is therefore `ac_only` until the new `Milestone-tracked tasks (FL-10)` section below gives the rollup script real task rows to compute from.

## M1 — Site on IaC with staging route
- **Status**: done
- **Description**: The site deploys from Terraform via OIDC, with a staging route gated by E2E tests.
- **Definition of done**:
  - [x] AC-1 Production infrastructure (S3, CloudFront, Route 53, IAM) is Terraform-managed, not hand-configured — evidence: deployment-log.md "v0.1.0 — Production (initial IaC deployment)" (2026-03-28); decisions.md "Terraform IaC for all production infrastructure" (2026-03-28)
  - [x] AC-2 Deploys authenticate via GitHub OIDC federated identity, no long-lived IAM access keys — evidence: decisions.md "GitHub OIDC deploy role (no long-lived secrets)" (2026-03-28); deployment-log.md v0.1.0 entry notes "OIDC deploy role active"
  - [x] AC-3 A staging environment (S3, CloudFront, DNS, deploy role) is provisioned and live — evidence: deployment-log.md "Staging environment provisioned (Terraform)" (2026-04-18)
  - [x] AC-4 Playwright E2E tests run in CI against the staging deploy on every qualifying push — evidence: deployment-log.md CLD-14 item-2 entry, workflow run 35753361363 and 35749677304, `E2E Tests (Staging)` ✅ (2026-09-22, re-confirming a pre-existing CI gate, not a new one)

## M2 — Content refresh
- **Status**: done
- **Description**: The homepage, projects and contact copy read in the new voice on the live site.
- **Epics**: CLD-12
- **Definition of done**:
  - [x] AC-5 The initial content-refresh story (3 PRs) merged, deployed and verified live as `v0.1.5` — evidence: workflow-state.md line 35 (tag `v0.1.5` @ `afac3632`, human approval "ship the changes to prod"); test-signoff.md PR #8 sign-off, 59/59 pass
  - [x] AC-6 Rounds 2-5 prose edits (PRs #11-#14) independently QA-validated pre-merge and on live staging, shipped to production as `v0.1.6` — evidence: deployment-log.md "v0.1.6 — Production" (2026-09-13, tag @ `e4001237d1e4bb01e2bd3b739e48f2aa3fad56ab`, workflow run 34763317301); project-status.md pass counts 31/31, 58/58, 62/62, 73/73
  - [x] AC-7 Round 6 prose edit (PR #15) merged and shipped to production as `v0.1.7` — evidence: deployment-log.md "v0.1.7 — Production" (2026-09-14, tag @ `861910f`, workflow run 34795972197); test-signoff.md Round 6 entry, 74/74 pass
  - [x] AC-8 Linear epic `CLD-12` reflects 100% / Done — evidence: workflow-state.md "Linear Onboarding" checkpoint, `CLD-12` `[100%] Content refresh — prose rounds 2-6 — Done`

## M3 — Light/dark theme toggle
- **Status**: done
- **Description**: Visitors can switch between dark and light themes on every page, and the choice persists.
- **Epics**: CLD-13
- **Definition of done**:
  - [x] AC-9 Toggle implemented per `spec/light-mode-toggle.md`, QA wrote and passed 95/95 tests pre-merge, PR #17 merged — evidence: project-status.md "CLD-13 — Light/dark theme toggle, shipped to staging" (PR #17, merge `b23d4a9`); test-signoff.md 95/95
  - [x] AC-10 Feature deployed to staging with the CI pipeline fully green — evidence: workflow-state.md Stage 4 entry, workflow run 35551660561 (`Deploy Staging`/`Deploy Prompted Staging`/`E2E Tests (Staging)` all ✅)
  - [x] AC-11 Feature promoted to production as `v0.1.8`, human-approved via Fleet Decisions `WS-2`, QA re-validated 95/95 live — evidence: decisions.md 2026-09-21 entry (`WS-2`, `decided_by_owner === true`, `decided_at: 2026-09-21T16:57:51.703Z`); deployment-log.md "v0.1.8 — Production"; test-signoff.md commit `b38827e`

## M4 — Ops & maintenance hardening
- **Status**: done
- **Description**: Main is branch-protected with a required PR check, and prod infra is guarded against deletion.
- **Epics**: CLD-14
- **Definition of done**:
  - [x] AC-12 Branch protection enabled on `main` (PR required, force-push/deletion blocked) — evidence: deployment-log.md "Branch protection enabled on `main`" (2026-09-22)
  - [x] AC-13 `deploy.yml` `paths:` allowlist added so docs/test-only commits stop redeploying staging, verified live both directions — evidence: deployment-log.md "`deploy.yml` staging trigger path-filtered" (2026-09-22, PR #18, merge `0d946db`)
  - [x] AC-14 Terraform hygiene landed: `prevent_destroy` guards on prod S3/CloudFront/Route53, tightened prod tag-ref guard, state-backend resources tagged — evidence: deployment-log.md "Infra hygiene" (2026-09-22, PR #19 + #20, merge `d858c59`)
  - [x] AC-15 A `pull_request`-triggered `PR Checks` job was added and set as `main`'s required status check, human-approved via Fleet Decisions `WS-3` — evidence: deployment-log.md "PR status check live" (2026-09-22, PR #21, merge `d5c7ebf`); decisions.md 2026-09-22 entry (`WS-3`, `decided_by_owner === true`, `decided_at: 2026-09-22T15:58:39.172Z`)

## M5 — picks.ericreilly.com DNS handoff
- **Status**: in_progress
- **Description**: picks.ericreilly.com resolves publicly and serves the odds-analysis site over valid HTTPS.
- **Target**: 2026-09-24
- **Definition of done**:
  - [x] AC-16 ACM DNS-validation CNAME for `picks.ericreilly.com` added to the shared `ericreilly.com` Route53 zone and publicly resolving — evidence: deployment-log.md "ACM DNS validation CNAME for `picks.ericreilly.com`" (2026-09-23, PR #22, merge `084f4635b2b25ea2a8175f59cfc61d652cfc769c`), publicly resolving via both `8.8.8.8` and `1.1.1.1` per workflow-state.md
  - [x] AC-17 `picks.ericreilly.com` A/AAAA alias record applied, pointing to `d2pw617i58c5iw.cloudfront.net` — evidence: PR #23 (merge `f90bcb3`), applied +2/0/0, deployment-log.md via PR #25 (merge `ce35fdb`)
  - [ ] AC-18 `https://picks.ericreilly.com` resolves via external resolvers and serves over valid TLS — evidence: pending QA sign-off (PM observed 2026-09-24: A/AAAA via 8.8.8.8/1.1.1.1, HTTP 200 over TLS; not a QA cycle)
