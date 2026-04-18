# ---------------------------------------------------------------------------
# Staging environment — staging.ericreilly.com
#
# This file provisions all staging-specific resources. It deliberately avoids
# modifying the production config in main.tf so there is no risk to the live
# site from staging changes.
#
# Prerequisites before running `terraform apply` for the first time:
#   - The bootstrap backend resources must exist (run bootstrap-backend.sh).
#   - `terraform init -migrate-state` must have been run so the S3 backend is
#     active and the prod state is already stored remotely.
# ---------------------------------------------------------------------------

locals {
  staging_environment      = "staging"
  staging_domain_name      = "staging.ericreilly.com"
  staging_bucket_name      = "ericreilly.com-staging"
  staging_deploy_role_name = "eric-reilly-website-staging-deploy"

  staging_tags = {
    Project     = local.project
    Environment = local.staging_environment
    ManagedBy   = "terraform"
  }
}

# ---------------------------------------------------------------------------
# ACM certificate — staging only
#
# A dedicated certificate for staging.ericreilly.com is created here rather
# than adding a SAN to the production certificate. This avoids any risk to the
# production certificate and keeps staging lifecycle management independent.
# ---------------------------------------------------------------------------
resource "aws_acm_certificate" "staging" {
  domain_name       = local.staging_domain_name
  validation_method = "DNS"

  options {
    certificate_transparency_logging_preference = "ENABLED"
  }

  lifecycle {
    create_before_destroy = true
  }

  tags = local.staging_tags
}

resource "aws_route53_record" "staging_certificate_validation" {
  for_each = {
    for dvo in aws_acm_certificate.staging.domain_validation_options : dvo.domain_name => dvo
  }

  zone_id = module.certificate_zone.zone_id
  name    = each.value.resource_record_name
  type    = each.value.resource_record_type
  ttl     = 60
  records = [each.value.resource_record_value]
}

resource "aws_acm_certificate_validation" "staging" {
  certificate_arn         = aws_acm_certificate.staging.arn
  validation_record_fqdns = [for record in aws_route53_record.staging_certificate_validation : record.fqdn]
}

# ---------------------------------------------------------------------------
# S3 + CloudFront — staging static site
# ---------------------------------------------------------------------------
module "staging_static_site" {
  source = "./modules/static_site"

  bucket_name     = local.staging_bucket_name
  domain_aliases  = [local.staging_domain_name]
  certificate_arn = aws_acm_certificate_validation.staging.certificate_arn
  tags            = local.staging_tags
}

# ---------------------------------------------------------------------------
# DNS — staging.ericreilly.com A record
# ---------------------------------------------------------------------------
resource "aws_route53_record" "staging_alias_a" {
  zone_id = module.certificate_zone.zone_id
  name    = local.staging_domain_name
  type    = "A"

  alias {
    name                   = module.staging_static_site.cloudfront_distribution_domain_name
    zone_id                = local.cloudfront_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "staging_alias_aaaa" {
  zone_id = module.certificate_zone.zone_id
  name    = local.staging_domain_name
  type    = "AAAA"

  alias {
    name                   = module.staging_static_site.cloudfront_distribution_domain_name
    zone_id                = local.cloudfront_zone_id
    evaluate_target_health = false
  }
}

# ---------------------------------------------------------------------------
# GitHub Actions deploy role — staging
#
# Reuses the existing OIDC provider created by the prod github_deploy module.
# The role trusts pushes to the main branch (staging deployments are triggered
# by merges to main, not tags).
# ---------------------------------------------------------------------------
module "staging_github_deploy" {
  source = "./modules/github_deploy"

  github_repository           = local.github_repository
  deploy_role_name            = local.staging_deploy_role_name
  bucket_arn                  = module.staging_static_site.bucket_arn
  cloudfront_distribution_arn = module.staging_static_site.cloudfront_distribution_arn
  tags                        = local.staging_tags

  # Reuse the OIDC provider created by the prod module — only one is allowed
  # per AWS account.
  create_oidc_provider = false
  oidc_provider_arn    = module.github_deploy.oidc_provider_arn

  # Staging deployments are triggered by pushes to main, not tags.
  ref_condition = "ref:refs/heads/main"
}

# ---------------------------------------------------------------------------
# Outputs
# ---------------------------------------------------------------------------
output "staging_website_bucket_name" {
  value       = module.staging_static_site.bucket_name
  description = "Name of the staging S3 website bucket."
}

output "staging_cloudfront_distribution_id" {
  value       = module.staging_static_site.cloudfront_distribution_id
  description = "CloudFront distribution ID for the staging environment. Update the STAGING_CF_DIST_ID GitHub Actions variable/secret with this value after the first terraform apply."
}

output "staging_cloudfront_distribution_domain_name" {
  value       = module.staging_static_site.cloudfront_distribution_domain_name
  description = "CloudFront domain name for staging (e.g. dXXXX.cloudfront.net)."
}

output "staging_github_actions_deploy_role_arn" {
  value       = module.staging_github_deploy.role_arn
  description = "ARN of the IAM role assumed by GitHub Actions for staging deployments. Set this as the STAGING_DEPLOY_ROLE_ARN GitHub Actions secret."
}
