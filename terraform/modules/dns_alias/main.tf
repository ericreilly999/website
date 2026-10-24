terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# A and AAAA alias records for a single name pointing at a CloudFront
# distribution. For the apex plus www pair use dns_aliases instead.
# Run it under the provider that can write the zone (pass `providers = { aws = aws.dns }`).

variable "zone_id" {
  type        = string
  description = "Route 53 hosted zone ID in which the records are created."
}

variable "name" {
  type        = string
  description = "Fully qualified record name (e.g. staging.example.com)."
}

variable "cloudfront_domain_name" {
  type        = string
  description = "CloudFront distribution domain name used as the alias target."
}

variable "cloudfront_zone_id" {
  type        = string
  description = "Hosted zone ID for CloudFront alias targets (always Z2FDTNDATAQYW2)."
  default     = "Z2FDTNDATAQYW2"
}

resource "aws_route53_record" "a" {
  zone_id = var.zone_id
  name    = var.name
  type    = "A"

  alias {
    name                   = var.cloudfront_domain_name
    zone_id                = var.cloudfront_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "aaaa" {
  zone_id = var.zone_id
  name    = var.name
  type    = "AAAA"

  alias {
    name                   = var.cloudfront_domain_name
    zone_id                = var.cloudfront_zone_id
    evaluate_target_health = false
  }
}
