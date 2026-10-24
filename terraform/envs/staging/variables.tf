variable "aws_account_id" {
  type        = string
  description = "12-digit id of the website-staging account that owns this stack. Provided by Platform; no default on purpose."

  validation {
    condition     = can(regex("^[0-9]{12}$", var.aws_account_id))
    error_message = "aws_account_id must be a 12-digit AWS account id."
  }
}

variable "aws_region" {
  type        = string
  description = "Region for all resources. CloudFront certificates must be in us-east-1."
  default     = "us-east-1"
}

variable "project" {
  type        = string
  description = "Project tag and resource name prefix."
  default     = "eric-reilly-website"
}

variable "environment" {
  type        = string
  description = "Environment tag."
  default     = "staging"
}

variable "github_repository" {
  type        = string
  description = "GitHub repository (owner/repo) allowed to assume the deploy roles."
  default     = "ericreilly999/website"
}

variable "dns_zone_id" {
  type        = string
  description = "Route 53 hosted zone ID, in the DNS account, holding the staging names (a delegated subzone or the Platform zone). Provided by Platform."
}

variable "dns_assume_role_arn" {
  type        = string
  description = "Platform record role to assume for DNS writes. Null when the zone is in this account."
  default     = null
}

variable "site_domain_name" {
  type        = string
  description = "Staging hostname of the main site."
  default     = "staging.ericreilly.com"
}

variable "prompted_domain_name" {
  type        = string
  description = "Staging hostname of the Prompted: Tech Talks site."
  default     = "staging.prompted.ericreilly.com"
}

variable "site_bucket_name" {
  type        = string
  description = "Globally unique S3 bucket name for the main site content. Must differ from the management-account bucket."
}

variable "prompted_bucket_name" {
  type        = string
  description = "Globally unique S3 bucket name for the Prompted site content. Must differ from the management-account bucket."
}

variable "attach_domain_aliases" {
  type        = bool
  description = "When true, CloudFront aliases and Route 53 alias records are created. Keep false until the cutover step: a hostname can only be an alias of one distribution at a time."
  default     = false
}
