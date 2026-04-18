# Decisions

Decisions are recorded in reverse-chronological order.

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
