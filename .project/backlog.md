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

## Q-43 follow-up: contact page 390px nav overflow (fixed on all pages by PR 59, v0.2.0)

- **ID**: B-Q43-08
- **Type**: Defect
- **Status**: Backlog
- **Estimate**: S
- **Milestone**: later
- **Created**: 2026-10-24 by DevOps
- **Priority**: Low
- **Source**: PR #43 review: the nav overflows horizontally at 390px width on /contact; pre-existing, not caused by PR #43
- **Spec link**: not yet speced
- **Outcome**: /contact has no horizontal overflow at 390px.
- **Acceptance**: at 390px viewport width the nav fits without horizontal scroll on /contact

## Q-43 follow-up: whitespace-only honeypot value

- **ID**: B-Q43-09
- **Type**: Question
- **Status**: Backlog
- **Estimate**: XS
- **Milestone**: later
- **Created**: 2026-10-24 by DevOps
- **Priority**: Low
- **Source**: PR #43 review: should the honeypot value be trimmed before the check? The spec says non-empty string, so a whitespace-only value currently counts as filled
- **Spec link**: not yet speced
- **Outcome**: decision recorded on whether whitespace-only honeypot values count as filled.
- **Acceptance**: spec states the rule; code and tests match it

---

## 0.2.1: Scale card bullet reads "Fractional technical leadership"

- **ID**: B-021-01
- **Type**: Feature
- **Status**: Done (v0.2.1 live 2026-11-27, PR 63, card WS-17, run 46058213548)
- **Estimate**: XS
- **Created**: 2026-11-27 by PM
- **Source**: owner, fleet chat 2026-11-27 (relayed by the coordinator): "another minor change for 0.2.1 - let's modify the text on the splash from: * Fractional technical leadership (team structure, delivery process, hiring support, operating cadence) to: * Fractional technical leadership"
- **Outcome**: the Scale card's third bullet is exactly `Fractional technical leadership`; the bullet stays.
- **Acceptance**:
  - `public/index.html` and `e2e/homepage.spec.js` updated; PR, review, staging, verifier, release card for 0.2.1

## 0.3.0: /links page

- **ID**: B-030-01
- **Type**: Feature
- **Status**: On staging (PR 65, 9fb0455); production not approved
- **Estimate**: S
- **Created**: 2026-11-27 by PM
- **Source**: owner queue Q-118 (1): "I want a ericreilly.com/links page - this should provide all my links. Linkedin, github, and shortly we will create an instagram and tiktok that we will link here too."
- **Outcome**: ericreilly.com/links lists LinkedIn and GitHub; Instagram and TikTok appear when the owner creates the accounts (hidden until then).
- **Acceptance**:
  - spec in `spec/`; page on the shared design system, in the build script, sitemap and the extensionless-page deploy loop; E2E coverage

## 0.3.0: constant A/B test of the home hero

- **ID**: B-030-02
- **Type**: Feature
- **Status**: On staging (PR 65, 9fb0455); results unreadable until the Analytics id exists
- **Estimate**: M
- **Created**: 2026-11-27 by PM
- **Source**: owner queue Q-118 (2): "I also want the splash page to have a constant A/B testing pipeline going. We can keep the hero text that we currently have on 0.2.0 as the main text, and you can come up with a new hero text to test as a second splash page."
- **Outcome**: visitors are split between the 0.2.0 hero (A) and an agent-drafted variant (B), with a measured goal and a way to read results.
- **Acceptance**:
  - spec names the goal metric, the split method for a static site, and how results are read; variant B copy shown to the owner before release

## 0.3.0: Google Analytics

- **ID**: B-030-03
- **Type**: Feature
- **Status**: On staging with the measurement id set (PRs 65, 67); staging sends nothing by design; production not approved
- **Estimate**: S
- **Created**: 2026-11-27 by PM
- **Source**: owner queue Q-118 (3): "We will also want this site to plug into google analytics as part of this next iteration."
- **Outcome**: the site reports page views and the A/B goal events to Google Analytics under the consent approach the owner chooses.
- **Acceptance**:
  - owner card answered (consent approach, data sharing); privacy notice as decided; measurement id supplied by the owner

## Follow-up: contrast and accessibility regression test

- **ID**: B-A11Y-01
- **Type**: Test
- **Status**: Ready
- **Estimate**: S
- **Created**: 2026-11-27 by PM
- **Source**: reviewer warnings on PRs 60 and 61; verifier record 61.md
- **Outcome**: an axe WCAG A/AA spec in `e2e/` covers the four pages and the prompted page in both themes after animations settle, so a palette edit cannot regress silently. Also update `spec/light-mode-toggle.md` section 5.4 (dark `--fg-dimmer` is now `#7D828B`).

## Follow-up: release pipeline loose ends from v0.2.0

- **ID**: B-REL-01
- **Type**: Infra
- **Status**: Ready
- **Estimate**: S
- **Created**: 2026-11-27 by PM
- **Source**: run website-2026-11-27-1701
- **Outcome**: (a) bump Playwright and return the staging E2E job to `ubuntu-latest`; (b) `Production Smoke` should not need a second environment approval; (c) document the real rollback path (v0.1.8 cannot be re-dispatched); (d) `sitemap.xml` lastmod and its test still say 2026-10-18; (e) reword the home-tile test ban on "live in production"; (f) the contact API still lacks the honeypot handler, and staging forms post to the production API.

## Follow-up: findings from the 0.2.1 and 0.3.0 reviews

- **ID**: B-REL-02
- **Type**: Fix
- **Status**: Ready
- **Estimate**: S
- **Created**: 2026-11-27 by PM
- **Source**: verifier record 63.md; reviewer of PR 65
- **Outcome**: (a) unknown paths return the home page with HTTP 200 instead of a 404; (b) `public/google5125689d7ed988c4.html` is not in the build list, so the Search Console verification file is not served; (c) before an Analytics id is set: turn off GA4 enhanced measurement or widen the privacy notice, and make `consent: "none"` respect a stored Decline; (d) self-host the fonts; (e) pre-existing en dashes in about.html and contact.html.

## Done

## Cancelled

## Q-43: move infra code to private repo website-infra (platform relay R-platform-20261024-5)

- **ID**: B-Q43-10
- **Type**: Infra
- **Status**: In progress (2026-11-09: terraform/ copied to website-infra branch claude/website-20261109-1325; removal from public repo, pipeline wiring, runbook update, relay answer pending; repo has no default branch yet)
- **Estimate**: M
- **Milestone**: M7
- **Created**: 2026-11-06 by PM
- **Source**: relay R-platform-20261024-5 (owner PL-69 option C; supersedes asks A1/A6 of R-platform-20261024-2)
- **Outcome**: Terraform roots live in a private repo using Platform's shared apply pipeline; the public repo keeps site content and dispatch-only content-deploy workflows.
- **Acceptance**:
  - private repo ericreilly999/website-infra exists (local task) and is attached to the session
  - terraform/envs/{staging,prod} and the legacy freeze moved from PRs 39-41; no Terraform apply from the public repo
  - runbook updated to WM-FR-33 to WM-FR-39 (platform spec pl1-website-account-migration.md v1.1.0)
  - relay answered with the moved paths
