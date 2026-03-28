terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = "us-east-1"
}

locals {
  project            = "eric-reilly-website"
  environment        = "prod"
  domain_name        = "ericreilly.com"
  www_domain_name    = "www.ericreilly.com"
  bucket_name        = "${local.domain_name}-prod"
  cloudfront_zone_id = "Z2FDTNDATAQYW2"
  github_repository  = "ericreilly999/website"
  deploy_role_name   = "eric-reilly-website-prod-deploy"

  common_tags = {
    Project     = local.project
    Environment = local.environment
    ManagedBy   = "terraform"
  }
}

module "certificate_zone" {
  source = "./modules/certificate_zone"

  domain_name     = local.domain_name
  www_domain_name = local.www_domain_name
  tags            = local.common_tags
}

module "static_site" {
  source = "./modules/static_site"

  bucket_name     = local.bucket_name
  domain_aliases  = [local.domain_name, local.www_domain_name]
  certificate_arn = module.certificate_zone.certificate_arn
  tags            = local.common_tags
}

module "dns_aliases" {
  source = "./modules/dns_aliases"

  zone_id                = module.certificate_zone.zone_id
  domain_name            = local.domain_name
  www_domain_name        = local.www_domain_name
  cloudfront_domain_name = module.static_site.cloudfront_distribution_domain_name
  cloudfront_zone_id     = local.cloudfront_zone_id
}

module "github_deploy" {
  source = "./modules/github_deploy"

  github_repository           = local.github_repository
  deploy_role_name            = local.deploy_role_name
  bucket_arn                  = module.static_site.bucket_arn
  cloudfront_distribution_arn = module.static_site.cloudfront_distribution_arn
  tags                        = local.common_tags
}

output "website_bucket_name" {
  value = module.static_site.bucket_name
}

output "cloudfront_distribution_id" {
  value = module.static_site.cloudfront_distribution_id
}

output "cloudfront_distribution_domain_name" {
  value = module.static_site.cloudfront_distribution_domain_name
}

output "certificate_arn" {
  value = module.certificate_zone.certificate_arn
}

output "github_actions_deploy_role_arn" {
  value = module.github_deploy.role_arn
}

moved {
  from = aws_route53_zone.website
  to   = module.certificate_zone.aws_route53_zone.website
}

moved {
  from = aws_acm_certificate.website
  to   = module.certificate_zone.aws_acm_certificate.website
}

moved {
  from = aws_route53_record.certificate_validation["ericreilly.com"]
  to   = module.certificate_zone.aws_route53_record.certificate_validation["ericreilly.com"]
}

moved {
  from = aws_route53_record.certificate_validation["www.ericreilly.com"]
  to   = module.certificate_zone.aws_route53_record.certificate_validation["www.ericreilly.com"]
}

moved {
  from = aws_acm_certificate_validation.website
  to   = module.certificate_zone.aws_acm_certificate_validation.website
}

moved {
  from = aws_s3_bucket.website
  to   = module.static_site.aws_s3_bucket.website
}

moved {
  from = aws_s3_bucket_public_access_block.website
  to   = module.static_site.aws_s3_bucket_public_access_block.website
}

moved {
  from = aws_s3_bucket_ownership_controls.website
  to   = module.static_site.aws_s3_bucket_ownership_controls.website
}

moved {
  from = aws_s3_bucket_server_side_encryption_configuration.website
  to   = module.static_site.aws_s3_bucket_server_side_encryption_configuration.website
}

moved {
  from = aws_s3_bucket_website_configuration.website
  to   = module.static_site.aws_s3_bucket_website_configuration.website
}

moved {
  from = aws_s3_bucket_policy.website
  to   = module.static_site.aws_s3_bucket_policy.website
}

moved {
  from = aws_cloudfront_distribution.website
  to   = module.static_site.aws_cloudfront_distribution.website
}

moved {
  from = aws_route53_record.website_alias_a
  to   = module.dns_aliases.aws_route53_record.website_alias_a
}

moved {
  from = aws_route53_record.website_alias_aaaa
  to   = module.dns_aliases.aws_route53_record.website_alias_aaaa
}

moved {
  from = aws_route53_record.www_alias_a
  to   = module.dns_aliases.aws_route53_record.www_alias_a
}

moved {
  from = aws_iam_openid_connect_provider.github_actions
  to   = module.github_deploy.aws_iam_openid_connect_provider.github_actions
}

moved {
  from = aws_iam_role.github_actions_deploy
  to   = module.github_deploy.aws_iam_role.github_actions_deploy
}

moved {
  from = aws_iam_policy.github_actions_deploy
  to   = module.github_deploy.aws_iam_policy.github_actions_deploy
}

moved {
  from = aws_iam_role_policy_attachment.github_actions_deploy
  to   = module.github_deploy.aws_iam_role_policy_attachment.github_actions_deploy
}
