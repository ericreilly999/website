# ---------------------------------------------------------------------------
# AWS SES DKIM authentication for gencast.ericreilly.com (Gencast prod)
#
# These records authorize AWS SES (in the gencast prod AWS account,
# `prompted-tech-talks-dev` profile, us-east-1) to send verified mail as
# the `gencast.ericreilly.com` domain identity per:
#   - gencast repo `.project/decisions.md` D-069 (Eric go-ahead, 2026-09-20,
#     verbatim: "2- can u do that?")
#   - gencast repo `.project/deployment-log.md`, "2026-09-19 (later) — SES
#     Domain Identity for gencast.ericreilly.com" entry (DKIM tokens issued
#     there via `aws sesv2 create-email-identity` in the gencast account)
#
# Precedent for a sibling account's SES records living in this repo's
# Terraform against the shared `ericreilly.com` zone: `ses-drinkup-staging.tf`
# (drinkup-staging account, 208937957023).
#
# The identity is on a dedicated subdomain (`gencast.ericreilly.com`), so
# SES deliverability events there do not contaminate the apex DKIM/DMARC
# reputation used by the existing SendGrid records (`sendgrid-drinkup.tf`)
# or the DrinkUp staging SES records (`ses-drinkup-staging.tf`) already in
# this zone.
#
# Records added: 3x DKIM CNAMEs (SES Easy-DKIM selectors for
# gencast.ericreilly.com). No MAIL FROM / SPF / DMARC records — out of
# scope per D-069 (DKIM-only authorization; Cognito sender cutover is a
# separate, unscoped decision).
# ---------------------------------------------------------------------------

locals {
  ses_gencast_tags = {
    Project     = "gencast"
    Environment = "prod"
    ManagedBy   = "terraform"
    Purpose     = "ses-sender-authentication"
  }

  # SES Easy-DKIM tokens issued by AWS on 2026-09-19 during
  # `aws sesv2 create-email-identity` for gencast.ericreilly.com in the
  # gencast prod account. Source of truth: gencast repo
  # `.project/deployment-log.md`, "SES Domain Identity for
  # gencast.ericreilly.com" entry. If SES rotates the keys, regenerate these.
  ses_gencast_dkim_tokens = [
    "ot7lskbnj3h2rw7czge7a7cfsrzvxnw6",
    "vhbzdb4k2qyz6pibjggbyxyqca76xi2p",
    "3esiitlq5mzjcy6wbmenobw5ewkv2h2h",
  ]
}

# DKIM CNAMEs — SES needs all three present to mark the identity as verified.
resource "aws_route53_record" "gencast_ses_dkim" {
  for_each = toset(local.ses_gencast_dkim_tokens)

  zone_id = module.certificate_zone.zone_id
  name    = "${each.value}._domainkey.gencast.ericreilly.com"
  type    = "CNAME"
  ttl     = 3600
  records = ["${each.value}.dkim.amazonses.com"]
}
