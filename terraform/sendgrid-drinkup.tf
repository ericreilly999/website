# ---------------------------------------------------------------------------
# SendGrid sender authentication for ericreilly.com
#
# These records authorize SendGrid to send mail as `*@ericreilly.com`.
# They are required by the DrinkUp project (staging and production both send
# transactional email from `noreply@ericreilly.com` via SendGrid). Adding the
# DKIM/return-path/DMARC records here keeps DNS authority in the website repo
# where the rest of the ericreilly.com zone is managed.
#
# Records added (provided by SendGrid sender-domain authentication wizard):
#   - em6103.ericreilly.com         CNAME -> u107100616.wl117.sendgrid.net
#   - s1._domainkey.ericreilly.com  CNAME -> s1.domainkey.u107100616.wl117.sendgrid.net
#   - s2._domainkey.ericreilly.com  CNAME -> s2.domainkey.u107100616.wl117.sendgrid.net
#   - _dmarc.ericreilly.com         TXT   -> v=DMARC1; p=none;
#
# DMARC is set to p=none (monitor-only) per SendGrid's recommended starting
# posture. Once SendGrid reports show clean alignment we can revisit
# tightening to quarantine/reject in a follow-up change.
# ---------------------------------------------------------------------------

locals {
  sendgrid_drinkup_tags = {
    Project     = "drinkup"
    Environment = "shared"
    ManagedBy   = "terraform"
    Purpose     = "sendgrid-sender-authentication"
  }
}

# Return-path / link-branding host. SendGrid generates a per-account hostname
# (em6103) so this value is specific to the DrinkUp SendGrid account.
resource "aws_route53_record" "drinkup_sendgrid_return_path" {
  zone_id = module.certificate_zone.zone_id
  name    = "em6103.ericreilly.com"
  type    = "CNAME"
  ttl     = 3600
  records = ["u107100616.wl117.sendgrid.net"]
}

# DKIM selector 1.
resource "aws_route53_record" "drinkup_sendgrid_dkim_s1" {
  zone_id = module.certificate_zone.zone_id
  name    = "s1._domainkey.ericreilly.com"
  type    = "CNAME"
  ttl     = 3600
  records = ["s1.domainkey.u107100616.wl117.sendgrid.net"]
}

# DKIM selector 2.
resource "aws_route53_record" "drinkup_sendgrid_dkim_s2" {
  zone_id = module.certificate_zone.zone_id
  name    = "s2._domainkey.ericreilly.com"
  type    = "CNAME"
  ttl     = 3600
  records = ["s2.domainkey.u107100616.wl117.sendgrid.net"]
}

# DMARC policy — monitor-only for initial rollout.
resource "aws_route53_record" "drinkup_sendgrid_dmarc" {
  zone_id = module.certificate_zone.zone_id
  name    = "_dmarc.ericreilly.com"
  type    = "TXT"
  ttl     = 3600
  records = ["v=DMARC1; p=none;"]
}
