# ACM certificate plus DNS validation records. Unlike certificate_zone, this
# module does NOT create a hosted zone: the zone lives with Platform (WS-8) or
# is a delegated subzone, and is passed in by id.
#
# Two provider configurations:
#   aws      the account that owns the certificate (website-staging / website-prod)
#   aws.dns  the account that owns the zone. Pass the same provider as `aws`
#            when the zone is in the same account (delegated subzone).

terraform {
  required_providers {
    aws = {
      source                = "hashicorp/aws"
      version               = "~> 5.0"
      configuration_aliases = [aws.dns]
    }
  }
}

variable "domain_name" {
  type        = string
  description = "Primary domain name on the certificate (e.g. staging.example.com)."
}

variable "subject_alternative_names" {
  type        = list(string)
  description = "Additional names (SANs) on the certificate. Leave empty for a single-name certificate."
  default     = []
}

variable "zone_id" {
  type        = string
  description = "Route 53 hosted zone ID, in the aws.dns account, in which the validation CNAMEs are written."
}

variable "tags" {
  type        = map(string)
  description = "Tags applied to the certificate."
}

locals {
  names = toset(concat([var.domain_name], var.subject_alternative_names))
}

resource "aws_acm_certificate" "this" {
  domain_name               = var.domain_name
  subject_alternative_names = var.subject_alternative_names
  validation_method         = "DNS"

  options {
    certificate_transparency_logging_preference = "ENABLED"
  }

  lifecycle {
    create_before_destroy = true
  }

  tags = var.tags
}

resource "aws_route53_record" "validation" {
  provider = aws.dns
  for_each = local.names

  zone_id         = var.zone_id
  name            = one([for dvo in aws_acm_certificate.this.domain_validation_options : dvo.resource_record_name if dvo.domain_name == each.value])
  type            = one([for dvo in aws_acm_certificate.this.domain_validation_options : dvo.resource_record_type if dvo.domain_name == each.value])
  ttl             = 60
  allow_overwrite = true
  records         = [one([for dvo in aws_acm_certificate.this.domain_validation_options : dvo.resource_record_value if dvo.domain_name == each.value])]
}

resource "aws_acm_certificate_validation" "this" {
  certificate_arn         = aws_acm_certificate.this.arn
  validation_record_fqdns = [for record in aws_route53_record.validation : record.fqdn]
}

output "certificate_arn" {
  value       = aws_acm_certificate_validation.this.certificate_arn
  description = "ARN of the validated ACM certificate."
}
