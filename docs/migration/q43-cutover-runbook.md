# Q-43 cutover runbook

**DRAFT. Pending Platform PM review. Not approved for execution.** Nothing in this runbook has been run. Every step that writes to AWS needs the approvals listed in `q43-inventory.md` section 7 first.

Scope: move `ericreilly.com`, `www`, `prompted`, `staging` and `staging.prompted` from management account `290993374431` to `website-staging` and `website-prod`, and move the `ericreilly.com` DNS zone to the platform account (WS-6, WS-7, WS-8). Inventory and names: `q43-inventory.md`.

## 0. Principles

- Build the new stack beside the old one. Nothing in the old stack changes until the new stack is validated.
- Staging goes first and rehearses every step.
- Each change is reversible until the old stack is destroyed; destroy happens last, after a soak, with owner approval.
- One writer to the zone at a time. During the zone move, no one applies Terraform that touches records.
- Lower TTLs ahead of time; restore them after.
- Out-of-band mutations are written down at the time (deployment log or Linear comment).

## 1. Preconditions (gate; all must be true)

1. Platform has delivered the needs list (`q43-inventory.md` section 3.1): account IDs, assume-role path, OIDC decision, DNS shape, new zone ID and name servers.
2. Owner cards T3-1 to T3-4 are answered. T3-2 sets the outage window for the apex alias move.
3. Contact form stable domain exists (B-Q43-04) or T3-3 accepted the URL change inside the cutover release.
4. `envs/staging` and `envs/prod` are applied through the pipeline; release smoke passes against the `*.cloudfront.net` domains.
5. Full copy of all record sets in the old zone is stored in the platform repo (the 42 current sets, including the roughly 11 not managed by website Terraform). A reviewer diffed it against `aws route53 list-resource-record-sets` the same day.
6. Rollback owner and a communications channel are named for each step.

## 2. Site: stand up, validate, switch

### 2.1 Stand up (no user impact)

1. Bootstrap state in the target account (bucket, versioning, SSE; native locking).
2. Apply `envs/<env>` through the pipeline. The CloudFront distribution is created **without** the production aliases at first, using only its `*.cloudfront.net` name. The ACM certificate is created and validated through the agreed path (subzone delegation, or CNAMEs written through the narrow record role).
3. Deploy the release tag's build to the new bucket with the new deploy workflow, so the content is exactly what production serves.

### 2.2 Validate on the CloudFront domain

1. Fetch `https://<dist>.cloudfront.net/` and the extensionless pages `/about`, `/projects`, `/contact`; compare response bodies to the live site (hash of each).
2. Run the Playwright suite with `PLAYWRIGHT_BASE_URL` set to the CloudFront domain.
3. Run the release-smoke checks and record the results in `.project/deployment-log.md`.
4. Submit the contact form on the new stack (staging first) and confirm delivery to the verified SES identity.
5. The certificate does not cover the `cloudfront.net` name, so browser TLS checks use the CloudFront default certificate. Hostname-level TLS is verified at the switch step (2.4), not before.

### 2.3 Non-apex hostnames first (`staging`, `staging.prompted`, `prompted`)

These are not apex names, so the AWS wildcard method is available (see the AWS doc "Move the alternate domain name"). The same procedure covers all three:

1. Request or confirm a certificate in the target account that covers the hostname; add the DNS validation record.
2. Move the alias using the documented wildcard or `update-domain-association` procedure for the cross-account case, from the account that owns the target distribution. Confirm the exact steps in the AWS doc at execution time; this draft does not fix them.
3. Once the target distribution is deployed, change the alias A/AAAA records to the new distribution (or delegate the subzone). With TTL already lowered to 60 seconds the switch is under two minutes.
4. Verify with `curl -sI https://<host>/` and the Playwright suite against the real hostname.

Rollback for each: change the alias back to the old distribution `dXXXX.cloudfront.net` (kept intact) and, if the alias was moved, move it back with the same procedure. Time to roll back: one DNS TTL plus distribution deploy time.

### 2.4 Apex and www (`ericreilly.com`, `www.ericreilly.com`): not strictly zero downtime

AWS does not let an apex alias move cross-account while the source distribution is enabled. Options, decided in T3-2:

- **A. Accepted short outage (recommended, personal site).** Off-peak window, announced in the PM log:
  1. Pre-lower TTLs on apex and www to 60 seconds, at least 48 hours ahead (record the old TTLs).
  2. Confirm the new W-prod distribution is deployed, its certificate covers apex and www, and the 2.2 validation passed.
  3. Disable the old distribution `EU0P2OBAYXZSI` (start of outage).
  4. Run `update-domain-association` for each alias from W-prod credentials against the new distribution.
  5. When the new distribution shows `Deployed`, point the apex A/AAAA and www A/AAAA at it (through the record role, or in the platform zone code).
  6. Verify: `curl -sI https://ericreilly.com/`, `https://www.ericreilly.com/`, Playwright against both. End of outage. Expected 5 to 15 minutes.
  7. Rollback if verification fails in 15 minutes: re-enable the old distribution, repoint the records at it (old distribution keeps its certificate), then `update-domain-association` back to the old distribution if the alias had moved.
- **B. AWS Support-assisted move.** Open a support case with both distribution IDs and certificates in advance; Support can move the alias without the disable step. Lead time unknown; use if the owner does not accept an outage.
- **C. Interim hostname.** Not a fix for apex; listed only so the option is considered: serving the site on a new name does not satisfy the requirement.

www (non-apex) could use the wildcard method, but it shares a certificate and distribution with the apex, so move it in the same window.

### 2.5 Soak and decommission

1. Watch CloudWatch and the Playwright smoke for the agreed soak (staging 24 hours, prod 3 days) with the old stack untouched.
2. Disable (do not delete) the old distributions and keep the old buckets.
3. After the rollback window, destroy the old stack with owner approval (Tier 3, B-Q43-06).

## 3. DNS: move the zone to the platform account

The registrar NS change is the highest-risk step in the program. Ordering below favours copying records to the new zone and verifying them before any delegation change.

### 3.1 Prepare (days before)

1. Platform creates the new `ericreilly.com` hosted zone and loads **every** record set from the old zone, including: apex alias A/AAAA and www, `staging`, `staging.prompted`, `prompted`, `picks`, `dev.gencast`, the DrinkUp names, all ACM validation CNAMEs, the SES DKIM/MAIL FROM/SPF/DMARC records for `gencast` and `mail`, and the SendGrid records and apex `_dmarc`. The alias targets must point at whatever serves the name at that moment (still the old distributions at this stage).
2. Diff: for every name and type in the old zone, the new zone returns identical answers. Query both name server sets directly: `dig @<old-ns> <name> <type>` against `dig @<new-ns> <name> <type>`, for the full list. Zero differences is the gate.
3. Lower the TTL of the NS record at the registrar (if the registrar allows) and the zone's own SOA/NS TTL to 300 seconds, at least 48 hours ahead; note the original values.
4. Freeze: no Terraform apply touches Route 53 in either account from here until step 3.4 is complete. Announce the freeze in the platform and website channels.

### 3.2 Switch (the delegation change)

1. Platform changes the NS set at the registrar to the new zone's name servers. Only platform holds registrar access.
2. Do not delete the old zone. Resolvers still holding the old NS keep getting correct answers from it until their cache expires.
3. Monitor for the TTL period of the old NS set (default 172800 seconds on the apex NS record, which is why step 3.1 lowers it first; otherwise plan for up to 48 hours of mixed answers).
4. Verification, repeated at +5 minutes, +1 hour, +24 hours: `dig NS ericreilly.com +trace`; HTTP 200 on the five website hostnames, `picks`, `dev.gencast`; mail checks: DKIM selectors for `gencast` and `mail` and SendGrid `s1`/`s2` resolve; send a test message through SES and SendGrid where the owning projects can; `_dmarc.ericreilly.com` resolves.

### 3.3 Record ownership afterwards

1. Website records (apex, www, `prompted`, `staging*`, ACM validation) are written by the website roots through the narrow record role or live in delegated subzones.
2. Mail and partner records (GenCast, DrinkUp, SendGrid, picks) are platform-owned code. Remove them from website state with `terraform state rm` **only after** platform confirms its code manages them and a plan there shows no changes. Never destroy them from website state (that would delete live records in the new zone if the zone ID were ever reused).
3. Recreate `drinkup-staging-route53-reader` in the platform account and confirm DrinkUp's Terraform plans.

### 3.4 Rollback (DNS)

- Before the registrar change: nothing to roll back; the new zone is unused.
- After the registrar change: restore the previous NS set at the registrar. The old zone is intact and unchanged, so answers return as caches expire. This is why the old zone is retained for at least 7 days and the freeze stays in force until the soak ends.
- If a record was missed: add it to the new zone immediately (the diff in 3.1 should prevent this) and re-run the full comparison.

### 3.5 Retire the old zone

After 7 days of clean monitoring and owner approval: platform deletes the old zone. `prevent_destroy` in `certificate_zone` blocks Terraform from doing it by accident; the website legacy code is removed first (`state rm`), then the zone is deleted by platform.

## 4. Order of execution (summary)

1. Staging: stand up (2.1), validate (2.2), switch (2.3).
2. Contact-form stable domain and page repoint (B-Q43-04).
3. Prod stack stand-up and validation (2.1, 2.2).
4. Prompted prod (2.3).
5. DNS zone move (3.1 to 3.2), with the website aliases still pointing at the old distributions so the zone move changes only the DNS provider, not the serving path.
6. Apex and www switch (2.4), in the T3-2 window, using the new platform zone.
7. Soak, then decommission (2.5, 3.5).

Doing the zone move before the apex switch separates two risky changes in time: if something breaks, only one of them is in play.

## 5. Open questions for Platform review

1. Does platform prefer a new zone plus registrar NS change, or a different mechanism to preserve the zone ID? (Route 53 hosted zones cannot move accounts; a new zone has new name servers, so a registrar change is unavoidable.)
2. Which record role shape does platform accept for the apex and www (section 3 of the inventory)?
3. Is there a platform-side change calendar or freeze window that constrains the apex outage window?
4. Who confirms each of the section 2.2 record groups is safe after the change (GenCast, DrinkUp, SendGrid, picks)?
