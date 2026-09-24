# ---------------------------------------------------------------------------
# ACM DNS validation CNAME for picks.ericreilly.com (odds-analysis project)
#
# The `odds-analysis` project is standing up a new CloudFront site on
# `picks.ericreilly.com`. Its ACM certificate lives in the odds-analysis AWS
# account (102429470155), not this repo's account (290993374431) — but the
# `ericreilly.com` public hosted zone lives here, so the DNS validation
# record for that cert has to be added in this repo's Terraform against the
# shared zone (`module.certificate_zone.zone_id`), same pattern as
# `ses-gencast.tf` for a sibling project's records in this zone.
#
# Authorization: Fleet Decisions page, collection `decisions`, doc `OA-17`
# (artifact https://claude.ai/artifact/AgEqZELaoLFLbCaWLqQUMS).
# `answer.decided_by_owner === true`, `decided_at: "2026-09-23T15:16:39.280Z"`,
# `status: "approved"`. Cross-checked against the odds-analysis repo's own
# `.project/deployment-log.md` ("DNS handoff to the `website` repo" entry,
# ~lines 1901-1927) — both sources agree on the record values below.
#
# Phase 1 of 2: the ACM DNS validation CNAME below. Phase 2 (this file's
# second half) adds the alias A/AAAA records once the odds-analysis
# CloudFront distribution is actually ready to serve this hostname.
# ---------------------------------------------------------------------------

resource "aws_route53_record" "picks_site_acm_validation" {
  zone_id = module.certificate_zone.zone_id
  name    = "_b3754202b86b096610d47972dee49a02.picks.ericreilly.com."
  type    = "CNAME"
  ttl     = 60
  records = ["_0b52c853550f59e3f26b2a3124b1b791.wzccmgtwzk.acm-validations.aws."]
}

# ---------------------------------------------------------------------------
# Alias A/AAAA records for picks.ericreilly.com (phase 2 of 2)
#
# Points picks.ericreilly.com at the odds-analysis CloudFront distribution
# (d2pw617i58c5iw.cloudfront.net). Same pattern as the staging_alias_a/aaaa
# records in staging.tf — plain resource blocks rather than the
# modules/dns_aliases module, since that module also provisions a paired
# www alias which doesn't apply here (single hostname, no www variant).
#
# Authorization: same Fleet Decisions doc as phase 1 — collection
# `decisions`, doc `OA-17` (artifact
# https://claude.ai/artifact/AgEqZELaoLFLbCaWLqQUMS).
# `answer.decided_by_owner === true`, `decided_at: "2026-09-23T15:16:39Z"`,
# `status: "approved"`. OA-17's approved plan names this exact record
# (name, alias target, alias zone).
#
# Sequencing: this must not go live (merge + apply) before the
# odds-analysis ACM certificate is ISSUED and the distribution has
# picks.ericreilly.com registered as an alternate domain name — otherwise
# visitors get a certificate/hostname mismatch. The PR carrying this change
# is opened for plan review immediately, but merge/apply is gated on a
# readiness check (TLS handshake against the CloudFront distribution for
# this SNI) polled independently of PR review. See
# .project/deployment-log.md for the readiness-check timestamps and the
# merge/apply record.
# ---------------------------------------------------------------------------

resource "aws_route53_record" "picks_site_alias_a" {
  zone_id = module.certificate_zone.zone_id
  name    = "picks.ericreilly.com"
  type    = "A"

  alias {
    name                   = "d2pw617i58c5iw.cloudfront.net"
    zone_id                = "Z2FDTNDATAQYW2"
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "picks_site_alias_aaaa" {
  zone_id = module.certificate_zone.zone_id
  name    = "picks.ericreilly.com"
  type    = "AAAA"

  alias {
    name                   = "d2pw617i58c5iw.cloudfront.net"
    zone_id                = "Z2FDTNDATAQYW2"
    evaluate_target_health = false
  }
}
