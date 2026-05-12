# ---------------------------------------------------------------------------
# AWS SES sender authentication for mail.ericreilly.com (DrinkUp staging)
#
# These records authorize AWS SES (in the drinkup-staging AWS account,
# 208937957023) to send transactional mail as `noreply@mail.ericreilly.com`.
# They migrate DrinkUp's transactional email channel off SendGrid's shared IP
# pool and onto AWS SES per:
#   - DrinkUp Epic 32 (Transactional Email Migration: SendGrid -> AWS SES)
#   - DrinkUp ADR-001 (Migrate Transactional Email from SendGrid to AWS SES)
#   - DrinkUp D-032  (Eric-ratified configuration values)
#
# Precipitating incident: SendGrid shared IP `159.183.235.50` was listed on
# the Comcast DNSBL (BL000100) on 2026-05-12, causing hard SMTP rejection of
# verification mail to every `@comcast.net` recipient. Blast radius is every
# non-Gmail receiver subscribed to an overlapping DNSBL.
#
# Reputation isolation: the SES identity is on a dedicated subdomain
# (`mail.ericreilly.com`), not the `ericreilly.com` apex, so SES deliverability
# events do not contaminate the apex DKIM/DMARC reputation that the existing
# SendGrid records (em7106, s1._domainkey, s2._domainkey, _dmarc) sit on.
# Both sender setups coexist for the 30-day rollback window per D-032.
#
# Records added:
#   - 3x DKIM CNAMEs (SES Easy-DKIM selectors for mail.ericreilly.com)
#   - 1x MAIL FROM MX (bounce.mail.ericreilly.com -> feedback-smtp.us-east-1.amazonses.com)
#   - 1x MAIL FROM SPF TXT (bounce.mail.ericreilly.com)
#   - 1x sending-domain SPF TXT (mail.ericreilly.com)
#   - 1x DMARC TXT (_dmarc.mail.ericreilly.com, p=none for first 30 days per D-032;
#     escalate to p=quarantine after stable sending — see Epic 32 NEED-ERIC-003)
#
# Production cutover (drinkup-prod account) is a separate, later PR — that
# identity verifies independently in its own AWS account per ADR-001.
# ---------------------------------------------------------------------------

locals {
  ses_drinkup_staging_tags = {
    Project     = "drinkup"
    Environment = "staging"
    ManagedBy   = "terraform"
    Purpose     = "ses-sender-authentication"
  }

  # SES Easy-DKIM tokens issued by AWS on 2026-05-12 during `terraform apply`
  # of `drinkup` repo `terraform/modules/email/` in the drinkup-staging account.
  # Source of truth lives in the drinkup-staging terraform state under
  # `module.email.aws_sesv2_email_identity.this.dkim_signing_attributes[0].tokens`.
  # If SES rotates the keys (next_signing_key_length change), regenerate these.
  ses_drinkup_staging_dkim_tokens = [
    "4li5amdi2k4tsolxiiecibvxavodvz3x",
    "fdztbdjslvumel56kmxggk4p3pr3ddxa",
    "tm2yi5kefrvjpxuj6suc5azf4si3lsfh",
  ]
}

# DKIM CNAMEs — SES needs all three present to mark the identity as verified.
resource "aws_route53_record" "drinkup_staging_ses_dkim" {
  for_each = toset(local.ses_drinkup_staging_dkim_tokens)

  zone_id = module.certificate_zone.zone_id
  name    = "${each.value}._domainkey.mail.ericreilly.com"
  type    = "CNAME"
  ttl     = 3600
  records = ["${each.value}.dkim.amazonses.com"]
}

# MAIL FROM MX — return-path / bounce routing for SES. The SES identity is
# configured with behavior_on_mx_failure = REJECT_MESSAGE, so SES will refuse
# to send if this MX is missing. Region must match the SES identity region
# (us-east-1 for drinkup-staging).
resource "aws_route53_record" "drinkup_staging_ses_mail_from_mx" {
  zone_id = module.certificate_zone.zone_id
  name    = "bounce.mail.ericreilly.com"
  type    = "MX"
  ttl     = 3600
  records = ["10 feedback-smtp.us-east-1.amazonses.com"]
}

# SPF TXT on the MAIL FROM subdomain — receivers checking the return-path
# domain SPF will land here. Strict `-all` is correct because nothing else
# sends from bounce.mail.ericreilly.com.
resource "aws_route53_record" "drinkup_staging_ses_mail_from_spf" {
  zone_id = module.certificate_zone.zone_id
  name    = "bounce.mail.ericreilly.com"
  type    = "TXT"
  ttl     = 3600
  records = ["v=spf1 include:amazonses.com -all"]
}

# SPF TXT on the sending domain — receivers checking the From: domain SPF
# will land here. Same strict `-all`.
resource "aws_route53_record" "drinkup_staging_ses_sending_spf" {
  zone_id = module.certificate_zone.zone_id
  name    = "mail.ericreilly.com"
  type    = "TXT"
  ttl     = 3600
  records = ["v=spf1 include:amazonses.com -all"]
}

# DMARC TXT for the sending subdomain.
# Policy is p=none for the first 30 days (monitor-only; aggregate reports go
# to ericreilly999@gmail.com) per D-032. After 30 days of clean reputation,
# escalate per Epic 32 NEED-ERIC-003 (default plan: p=quarantine; p=reject
# is stricter and risks bouncing legitimately-aligned mail).
#
# Note: this DMARC record is for the `mail.ericreilly.com` subdomain only.
# The existing apex `_dmarc.ericreilly.com` record (set by sendgrid-drinkup.tf)
# is untouched — apex DMARC remains p=none for SendGrid until decommissioning.
resource "aws_route53_record" "drinkup_staging_ses_dmarc" {
  zone_id = module.certificate_zone.zone_id
  name    = "_dmarc.mail.ericreilly.com"
  type    = "TXT"
  ttl     = 3600
  records = ["v=DMARC1; p=none; rua=mailto:ericreilly999@gmail.com; ruf=mailto:ericreilly999@gmail.com; fo=1; pct=100"]
}
