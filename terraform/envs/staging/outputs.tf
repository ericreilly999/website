output "site_bucket_name" {
  value       = module.site.bucket_name
  description = "Main site bucket. Set as the S3_BUCKET variable on the GitHub staging environment."
}

output "site_cloudfront_distribution_id" {
  value       = module.site.cloudfront_distribution_id
  description = "Main site distribution id. Set as CF_DIST_ID on the GitHub staging environment."
}

output "site_cloudfront_domain_name" {
  value       = module.site.cloudfront_distribution_domain_name
  description = "Main site cloudfront.net name, usable for validation before aliases are attached."
}

output "site_deploy_role_arn" {
  value       = module.site_deploy.role_arn
  description = "Main site deploy role. Set as AWS_ROLE_ARN on the GitHub staging environment."
}

output "prompted_bucket_name" {
  value       = module.prompted.bucket_name
  description = "Prompted site bucket. Set as PROMPTED_S3_BUCKET on the GitHub staging environment."
}

output "prompted_cloudfront_distribution_id" {
  value       = module.prompted.cloudfront_distribution_id
  description = "Prompted distribution id. Set as PROMPTED_CF_DIST_ID on the GitHub staging environment."
}

output "prompted_cloudfront_domain_name" {
  value       = module.prompted.cloudfront_distribution_domain_name
  description = "Prompted cloudfront.net name, usable for validation before aliases are attached."
}

output "prompted_deploy_role_arn" {
  value       = module.prompted_deploy.role_arn
  description = "Prompted deploy role. Set as PROMPTED_AWS_ROLE_ARN on the GitHub staging environment."
}
