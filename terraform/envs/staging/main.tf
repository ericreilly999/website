locals {
  tags = {
    Project     = var.project
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# --- Main site ---------------------------------------------------------------
module "site_certificate" {
  source = "../../modules/certificate"
  providers = {
    aws     = aws
    aws.dns = aws.dns
  }

  domain_name = var.site_domain_name
  zone_id     = var.dns_zone_id
  tags        = local.tags
}

module "site" {
  source = "../../modules/static_site"

  bucket_name       = var.site_bucket_name
  domain_aliases    = var.attach_domain_aliases ? [var.site_domain_name] : []
  certificate_arn   = module.site_certificate.certificate_arn
  enable_versioning = true
  tags              = local.tags
}

module "site_dns" {
  source    = "../../modules/dns_alias"
  count     = var.attach_domain_aliases ? 1 : 0
  providers = { aws = aws.dns }

  zone_id                = var.dns_zone_id
  name                   = var.site_domain_name
  cloudfront_domain_name = module.site.cloudfront_distribution_domain_name
}

module "site_deploy" {
  source = "../../modules/github_deploy"

  github_repository           = var.github_repository
  deploy_role_name            = "${var.project}-${var.environment}-deploy"
  bucket_arn                  = module.site.bucket_arn
  cloudfront_distribution_arn = module.site.cloudfront_distribution_arn
  tags                        = local.tags

  # Creates the single GitHub OIDC provider allowed in this account.
  create_oidc_provider = true
  # The deploy job uses the GitHub environment of the same name, so the sub claim is environment-scoped.
  ref_condition = "environment:${var.environment}"
}

# --- Prompted: Tech Talks ----------------------------------------------------
module "prompted_certificate" {
  source = "../../modules/certificate"
  providers = {
    aws     = aws
    aws.dns = aws.dns
  }

  domain_name = var.prompted_domain_name
  zone_id     = var.dns_zone_id
  tags        = local.tags
}

module "prompted" {
  source = "../../modules/static_site"

  bucket_name       = var.prompted_bucket_name
  domain_aliases    = var.attach_domain_aliases ? [var.prompted_domain_name] : []
  certificate_arn   = module.prompted_certificate.certificate_arn
  enable_versioning = true
  tags              = local.tags
}

module "prompted_dns" {
  source    = "../../modules/dns_alias"
  count     = var.attach_domain_aliases ? 1 : 0
  providers = { aws = aws.dns }

  zone_id                = var.dns_zone_id
  name                   = var.prompted_domain_name
  cloudfront_domain_name = module.prompted.cloudfront_distribution_domain_name
}

module "prompted_deploy" {
  source = "../../modules/github_deploy"

  github_repository           = var.github_repository
  deploy_role_name            = "${var.project}-${var.environment}-prompted-deploy"
  bucket_arn                  = module.prompted.bucket_arn
  cloudfront_distribution_arn = module.prompted.cloudfront_distribution_arn
  tags                        = local.tags

  create_oidc_provider = false
  oidc_provider_arn    = module.site_deploy.oidc_provider_arn
  ref_condition        = "environment:${var.environment}"
}
