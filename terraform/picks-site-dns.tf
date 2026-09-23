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
# Scope note — deliberately NOT included here:
# This is phase 1 of a two-phase handoff. The alias A/AAAA record for
# `picks.ericreilly.com` -> CloudFront (d2pw617i58c5iw.cloudfront.net,
# zone Z2FDTNDATAQYW2) is NOT added in this file. Per OA-17's own recorded
# outcome, that alias must wait until (a) the odds-analysis ACM certificate
# shows ISSUED, and (b) odds-analysis's own DevOps flips
# `picks_site_enable_custom_domain = true` in their Terraform and re-applies
# to register picks.ericreilly.com as a CloudFront alternate domain name.
# Pointing live DNS at the distribution before that would produce a
# certificate/hostname mismatch (CloudFront's default cert doesn't cover
# this hostname) for anyone who resolves it. Adding the alias is out of
# scope for this change and is not this repo's call to make unilaterally —
# it depends on odds-analysis's own apply.
# ---------------------------------------------------------------------------

resource "aws_route53_record" "picks_site_acm_validation" {
  zone_id = module.certificate_zone.zone_id
  name    = "_b3754202b86b096610d47972dee49a02.picks.ericreilly.com."
  type    = "CNAME"
  ttl     = 60
  records = ["_0b52c853550f59e3f26b2a3124b1b791.wzccmgtwzk.acm-validations.aws."]
}
