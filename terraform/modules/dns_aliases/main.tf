variable "zone_id" {
  type        = string
  description = "Route 53 hosted zone ID in which the alias records will be created."
}

variable "domain_name" {
  type        = string
  description = "Apex domain name to create an A and AAAA alias record for (e.g. example.com)."
}

variable "www_domain_name" {
  type        = string
  description = "www subdomain to create an A alias record for (e.g. www.example.com)."
}

variable "cloudfront_domain_name" {
  type        = string
  description = "CloudFront distribution domain name used as the alias target."
}

variable "cloudfront_zone_id" {
  type        = string
  description = "Hosted zone ID for the CloudFront distribution (always Z2FDTNDATAQYW2)."
}

resource "aws_route53_record" "website_alias_a" {
  zone_id = var.zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = var.cloudfront_domain_name
    zone_id                = var.cloudfront_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "website_alias_aaaa" {
  zone_id = var.zone_id
  name    = var.domain_name
  type    = "AAAA"

  alias {
    name                   = var.cloudfront_domain_name
    zone_id                = var.cloudfront_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "www_alias_a" {
  zone_id = var.zone_id
  name    = var.www_domain_name
  type    = "A"

  alias {
    name                   = var.cloudfront_domain_name
    zone_id                = var.cloudfront_zone_id
    evaluate_target_health = false
  }
}
