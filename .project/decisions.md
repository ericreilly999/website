# Decisions

Decisions are recorded in reverse-chronological order.

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
