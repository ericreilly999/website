variable "aws_account_id" {
  type        = string
  description = "12-digit id of the website-prod account that owns this stack. Provided by Platform; no default on purpose."

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
  description = "Environment tag. Also the GitHub environment name used in the OIDC sub claim."
  default     = "production"
}

variable "github_repository" {
  type        = string
  description = "GitHub repository (owner/repo) allowed to assume the deploy roles."
  default     = "ericreilly999/website"
}

variable "dns_zone_id" {
  type        = string
  description = "Route 53 hosted zone ID of ericreilly.com in the DNS account. Provided by Platform."
}

variable "dns_assume_role_arn" {
  type        = string
  description = "Platform record role to assume for DNS writes (apex, www, ACM validation, prompted). Null only if the zone is in this account."
  default     = null
}

variable "site_domain_name" {
  type        = string
  description = "Apex hostname of the main site."
  default     = "ericreilly.com"
}

variable "site_www_domain_name" {
  type        = string
  description = "www hostname of the main site."
  default     = "www.ericreilly.com"
}

variable "prompted_domain_name" {
  type        = string
  description = "Hostname of the Prompted: Tech Talks site."
  default     = "prompted.ericreilly.com"
}

variable "site_bucket_name" {
  type        = string
  description = "Globally unique S3 bucket name for the main site content. Must differ from the management-account bucket ericreilly.com-prod."
}

variable "prompted_bucket_name" {
  type        = string
  description = "Globally unique S3 bucket name for the Prompted site content. Must differ from the management-account bucket."
}

variable "attach_domain_aliases" {
  type        = bool
  description = "When true, CloudFront aliases and Route 53 alias records are created for the production names. Keep false until the cutover step: this takes over live hostnames."
  default     = false
}

variable "contact_form_name" {
  type        = string
  description = "Base name of the contact-form Lambda, role and API."
  default     = "contact-form-prod"
}

variable "contact_to_email" {
  type        = string
  description = "Address that receives contact-form submissions (SES identity; the owner must click the verification link)."
}

variable "contact_from_email" {
  type        = string
  description = "Sender address of the contact form (SES identity; the owner must click the verification link)."
}

variable "contact_allowed_origins" {
  type        = list(string)
  description = "Origins allowed by the contact API CORS policy."
  default = [
    "https://ericreilly.com",
    "https://www.ericreilly.com",
    "https://prompted.ericreilly.com",
  ]
}
