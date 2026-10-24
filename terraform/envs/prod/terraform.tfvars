# Non-account values only. Account-specific inputs (aws_account_id, dns_zone_id,
# dns_assume_role_arn, contact emails) go in platform.auto.tfvars (gitignored) or
# TF_VAR_*; see platform.auto.tfvars.example. Bucket names are global: confirm they are free.
site_domain_name     = "ericreilly.com"
site_www_domain_name = "www.ericreilly.com"
prompted_domain_name = "prompted.ericreilly.com"
site_bucket_name     = "ericreilly-website-prod-site"
prompted_bucket_name = "ericreilly-website-prod-prompted"

# Stays false until the cutover runbook step that takes the live names.
attach_domain_aliases = false
