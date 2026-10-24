# Non-account values only. Account-specific inputs (aws_account_id, dns_zone_id,
# dns_assume_role_arn) go in platform.auto.tfvars (gitignored) or TF_VAR_*;
# see platform.auto.tfvars.example. Bucket names are global: confirm they are free.
site_domain_name     = "staging.ericreilly.com"
prompted_domain_name = "staging.prompted.ericreilly.com"
site_bucket_name     = "ericreilly-website-staging-site"
prompted_bucket_name = "ericreilly-website-staging-prompted"
