variable "domain_name" {
  type        = string
  description = "Apex domain name (e.g. example.com). Used as the primary name on the ACM certificate."
}

variable "www_domain_name" {
  type        = string
  description = "www subdomain (e.g. www.example.com). Added as a SAN on the ACM certificate."
}

variable "tags" {
  type        = map(string)
  description = "Tags applied to all resources created by this module."
}

locals {
  certificate_domains = toset([var.domain_name, var.www_domain_name])
}

resource "aws_route53_zone" "website" {
  name          = var.domain_name
  comment       = "Managed by Terraform"
  force_destroy = false
  tags          = var.tags
}

resource "aws_acm_certificate" "website" {
  domain_name               = var.domain_name
  subject_alternative_names = [var.www_domain_name]
  validation_method         = "DNS"

  options {
    certificate_transparency_logging_preference = "ENABLED"
  }

  lifecycle {
    create_before_destroy = true
  }

  tags = var.tags
}

resource "aws_route53_record" "certificate_validation" {
  for_each = local.certificate_domains

  zone_id = aws_route53_zone.website.zone_id
  name    = one([for dvo in aws_acm_certificate.website.domain_validation_options : dvo.resource_record_name if dvo.domain_name == each.value])
  type    = one([for dvo in aws_acm_certificate.website.domain_validation_options : dvo.resource_record_type if dvo.domain_name == each.value])
  ttl     = 60
  records = [one([for dvo in aws_acm_certificate.website.domain_validation_options : dvo.resource_record_value if dvo.domain_name == each.value])]
}

resource "aws_acm_certificate_validation" "website" {
  certificate_arn = aws_acm_certificate.website.arn
  validation_record_fqdns = [
    for record in aws_route53_record.certificate_validation : record.fqdn
  ]
}

output "zone_id" {
  value       = aws_route53_zone.website.zone_id
  description = "Route 53 hosted zone ID for the domain."
}

output "certificate_arn" {
  value       = aws_acm_certificate_validation.website.certificate_arn
  description = "ARN of the validated ACM certificate."
}
