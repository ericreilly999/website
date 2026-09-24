# Decisions

Decisions are recorded in reverse-chronological order.

---

## 2026-09-24 — First `.project/milestones.md` written (FL-10)
**Decision:** Wrote the first `.project/milestones.md`, retrospectively, per the fleet-wide milestone-tracking rollout (`~/.claude/fleet/specs/milestone-tracking.md` §1, FL-10). Defined 5 milestones in delivery order — M1 Site on IaC with staging route, M2 Content refresh (`CLD-12`), M3 Light/dark theme toggle (`CLD-13`), M4 Ops & maintenance hardening (`CLD-14`), M5 `picks.ericreilly.com` DNS handoff (`OA-17`, cross-project for `odds-analysis`, `in_progress`) — reconstructed entirely from evidence already in `project-status.md`, `workflow-state.md`, `test-signoff.md`, `deployment-log.md` and this file. Every AC checkbox cites a real pointer (PR/merge SHA, deployment-log entry, QA sign-off, or a Fleet Decisions approval id) found in those files; none was marked done on assertion. M5's two remaining ACs (the CloudFront alias record, and live TLS resolution) are left unchecked — no evidence exists yet, both are blocked on `odds-analysis`'s own follow-up.
**Also:** appended a `### Milestone-tracked tasks (FL-10)` section to `.project/TODO.md` (T-01/T-02/T-03, tagged `[M5]`) so `milestone-rollup.js` has real task rows to compute M5's completion from — no prior TODO entries were modified. Ran the rollup script against this project: parsed all 5 milestones, 18 ACs and the 3 new tasks cleanly; `milestone_current: "M5"`, `completion: 25`.
**Scope note:** M1 predates this project's Linear onboarding (infra work 2026-03-28/04-18; Linear added 2026-09-19) and so carries no `Epics` line — no CLD issue was ever opened for it, and none should be backfilled retroactively. M2's `scope_confidence` computes as `ac_only` since no backlog items or TODO tasks were ever tagged to the prose-refresh rounds (a standing PM decision, not an oversight — see `project-status.md` "What's Coming Next").
**Rationale:** This is documentation only, decomposing existing, already-shipped work into the new tracking format — no scope, code, or infra changed.

---

## 2026-09-22 — CLD-14 ops & maintenance backlog: branch protection, deploy.yml path filter, Terraform hygiene, PR check gate (human-approved / Tier-1-2 execution)
**Decision:** Executed all three items of Linear epic `CLD-14` in one session (Eric asked ~11:30 ET whether the ops backlog was running — it wasn't): (1) branch protection on `main` via `gh api` — PR required, 0 required approving reviews (no second reviewer exists on this solo-author repo, verified empirically), initially 0 required status checks (no `pull_request` trigger existed yet); (2) a `paths:` allowlist on `deploy.yml`'s `push` trigger (PR #18, merge `0d946db`) so docs/test-only commits stop redeploying staging — QA-verified live both directions; (3) DEVOPS-04/05/06 Terraform hygiene (PR #19 + #20) — `prevent_destroy` guards on prod S3/CloudFront/Route53 (no `terraform apply` needed: `lifecycle` is plan-time-only, not state-persisted, proven via a plan-only `terraform plan -destroy`), tightened `deploy-prod` tag-ref guard, and live tagging of the Terraform state-backend bucket/table (out-of-band mutation, traced in `deployment-log.md`).
**Follow-on (WS-3):** Item 1 left a real gap — no PR-triggered job existed to populate `required_status_checks`, and building one is a *new workflow trigger*, Tier 3 (GitHub Actions minutes) under the autonomy bar. Queued as Fleet Decisions `WS-3` rather than built speculatively. **Authorization:** Direct-channel human approval on the Fleet Decisions page (https://claude.ai/artifact/AgEqZELaoLFLbCaWLqQUMS), decision id `WS-3`, `answer.decided_by_owner === true`, decided `2026-09-22T15:58:39.172Z` — verified directly via `ArtifactData`, not via any agent's description of the page. Executed same session: added a `pull_request`-triggered `PR Checks` job (`npm test` only, no AWS credentials, no deploy step — three independent layers confirmed keep it away from AWS) and set it as the required status check (PR #21, merge `d5c7ebf`). Deliberately no path filter on this trigger (a path-filtered `pull_request` job never starts, so no check-run is ever created and the PR waits forever — different failure mode from an `if:`-skipped job, which still reports `skipped` = passing).
**Model note:** Two coordinator-relayed "run everything on Opus" instructions arrived before any verifiable record existed and were declined (coordinator relay alone is not a direct-channel authorization per the fleet Tier-3 approval-channel convention). A third cited Fleet Decisions `FP-3`; verified directly via `ArtifactData` (project `Fleet process`, `answer.decided_by_owner === true`, `decided_at: 2026-09-22T15:43:20.636Z`, scope "all Agent dispatches ... until 21:00 ET 2026-09-22") — genuine, acted on from that point forward. One dispatched Code Reviewer subagent briefly ran on the wrong model (its own stale Sonnet default) before catching `FP-3` itself mid-task, standing down with zero GitHub writes, and handing off to an Opus-run replacement — no duplicate comments, no merge race.
**Rationale:** All three original CLD-14 items were pure hygiene (no cost/exposure change), matching the run's own framing. The one genuine Tier-3 question anticipated going in (a prod-affecting `terraform apply` for `prevent_destroy`) turned out to be unnecessary by Terraform's own design — recorded here so a future session doesn't re-open it as a pending apply.

---

## 2026-09-21 — Light/dark theme toggle: promote to production, tag v0.1.8 (human-approved via Fleet Decisions)
**Decision:** Promoted `CLD-13` (light/dark theme toggle) from staging to production. Tagged `main` @ `77951eb` as `v0.1.8`, pushed; `Deploy Production` and `Deploy Prompted Production` both succeeded (workflow run [35675110707](https://github.com/ericreilly999/website/actions/runs/35675110707)). QA independently confirmed 95/95 passing live against `https://ericreilly.com` post-deploy (`test-signoff.md` commit `b38827e`).
**Authorization:** Direct-channel human approval on the Fleet Decisions page (https://claude.ai/artifact/AgEqZELaoLFLbCaWLqQUMS), decision id `WS-2`, `answer.decided_by_owner === true`, decided `2026-09-21T16:57:51.703Z`. This satisfies the Tier 3 prod-deploy stop under the autonomy bar — no separate in-session ask was needed since the owner-decision channel already carries that authorization.
**Version note (semver reconciliation):** The fleet rollup and Fleet Decisions page both referenced `v0.1.8` as the next tag, but `git tag` on this checkout also shows a `v1.0.0`–`v1.1.3` series (created 2026-04-18/19, all five tags within a ~14-hour window). That series is **not** the project's tracked release lineage: `.project/deployment-log.md` and `.project/workflow-state.md` show continuous `v0.1.x` tracking straight through `v0.1.4` (2026-04-04) to `v0.1.5` (2026-09-08) with zero mention of the `v1.x.x` tags anywhere in either file. Given the timing (squeezed into the gap between two tracked `v0.1.x` releases) and this project's own documented incident of runaway tag-push iteration during CI debugging (see `ci-discipline.md`'s "18 consecutive failed tag pushes" background), these are almost certainly stray tags from an abandoned/experimental CI-debugging episode, never adopted as this project's actual versioning scheme. Decision: continue the tracked `v0.1.x` lineage — `v0.1.8` is correct. The orphaned `v1.x.x` tags were left untouched (not deleted, not built on).
**Scope note:** QA's post-deploy pass found `prompted.ericreilly.com` does not carry the toggle — it's a fully self-contained static page with its own inline styles, no `shared.css` link, no theme JS. This matches `spec/light-mode-toggle.md`, which scoped the toggle to the 3 main-site pages only (home, projects, contact); `prompted.ericreilly.com`'s own deploy jobs exist for unrelated static content, not this feature. No regression, no scope gap — recorded here since the original run brief assumed toggle presence on `prompted.ericreilly.com` too.
**Rationale:** Feature was fully staging-validated (95/95) prior to this promotion; no code changed between staging sign-off (`b23d4a9`) and the tag (`77951eb` differs only in `.project/`/`lessons-learned.md` tracking files). Straight promotion, no re-implementation risk.

---

## 2026-09-20 — Light/dark theme toggle: build and ship to staging (human-directed)
**Decision:** Eric said (verbatim): "build the light/dark mode toggle and ship to staging." Pulled `CLD-13` into the active sprint and ran it through Stage 1 (QA test-writing) → Stage 5 (staging QA sign-off) in one session, per the already-complete spec (`spec/light-mode-toggle.md`) and TODO decomposition (QA-07..QA-09, DEV-05, DEV-06) recovered and committed 2026-09-19.
**Rationale:** Spec and task decomposition were already reviewed and complete; no new scoping needed, only execution.
**Scope boundary:** Explicitly stops at staging — no production tag push this session. Human will review `staging.ericreilly.com` / `staging.prompted.ericreilly.com` and approve production promotion separately (Tier 3 per the autonomy bar; prod deploys are never autonomous).
**Tier 3 check:** Prod deploy withheld pending human approval, consistent with spec §8's confirmation that no architecture/cost/security review is needed for the feature itself.

---

## 2026-09-14 — Light/dark theme toggle: spec and Tier 2 defaults
**Decision:** Wrote `spec/light-mode-toggle.md` for a light/dark theme toggle (human request: "let's ship a light mode theme toggle for the website"). `spec/` did not exist previously; created as the convention going forward. Decomposed into TODO tasks QA-07 through QA-09 and DEV-05/DEV-06, added directly to the Active Sprint in `.project/TODO.md` (no `backlog.md` exists yet; followed the same direct-add pattern already used for prior human-directed stories in this file, e.g. "Project portfolio follow-up fix") rather than introducing a formal backlog cycle for a single ad-hoc feature.
**Tier 2 decisions made autonomously (flagged in spec §4 for override):**
- Toggle lives in `nav.top`, appended after the `github ↗` link, identical on all 3 pages — icon button (sun/moon), not text or a labeled switch.
- Default appearance on first visit (no stored preference) is **dark**, ignoring OS `prefers-color-scheme` — the dark theme is the site's established brand identity per `project-status.md` ("shared dark-theme design system"), not an arbitrary default to be overridden by OS preference.
- Persistence via `localStorage.theme` (`"light"`/`"dark"`), global across all 3 pages, no per-page override.
- Light-mode accent color is a darker blue (`#1B5FC7`) than the dark-mode accent (`#6AA6FF`), not the same hex — the dark-mode value fails WCAG AA (~2.3:1) against a white background. New `--on-accent` custom property added so button text stays legible against whichever accent shade is active per theme.
**Rationale:** These are internal UX/implementation calls (placement, default, exact palette), not scope/security/cost questions, so decided rather than blocking per the autonomy bar. All are cheap to redirect since nothing has been implemented yet.
**Tier 3 check:** None found — pure client-side CSS/JS, no backend, infra, cost, or auth impact (confirmed in spec §8).
**Alternatives considered:** Respecting `prefers-color-scheme` as the first-visit default (rejected, see spec §4 item 3). Reusing the existing dark-mode accent hex unchanged in light mode (rejected — fails contrast).

---

## 2026-04-04 — Content refresh: project storytelling rewrite
**Decision:** Rewrote portfolio project descriptions to emphasise the "why I built this" narrative rather than technical specs.
**Rationale:** Personal brand positioning; context and motivation resonate more than feature lists.
**Alternatives considered:** None recorded.

---

## 2026-03-28 — Terraform IaC for all production infrastructure
**Decision:** Codify all existing production AWS resources in Terraform (`terraform/`).
**Rationale:** Recoverable infrastructure; prevents undocumented manual drift; enables reproducibility.
**Alternatives considered:** Leave resources as unmanaged manual config.

---

## 2026-03-28 — GitHub OIDC deploy role (no long-lived secrets)
**Decision:** Use GitHub OIDC federated identity (`arn:aws:iam::290993374431:role/eric-reilly-website-prod-deploy`) instead of long-lived IAM access keys.
**Rationale:** Security best practice; no secrets to rotate or leak.
**Alternatives considered:** IAM access key stored in GitHub Secrets.

---

## 2026-03-28 — Simple route-to-live (tag → prod only)
**Decision:** Tag pushes on `main` deploy directly to production. No staging environment.
**Rationale:** Personal portfolio site; risk tolerance is higher than a multi-user product.
**Alternatives considered:** Standard route with staging. Not taken due to cost and complexity overhead for a solo project.
**Risk:** All changes are live immediately after tagging. Mitigated by keeping changes small and testing locally before tagging.

---

## 2026-03-23 — Recover source from S3 production bucket
**Decision:** Recover source code from deployed S3 bucket (`s3://ericreilly.com-prod`) using production source maps.
**Rationale:** Original source was not in version control; production was the only copy.
**Alternatives considered:** Rebuild from scratch.
