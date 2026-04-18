variable "github_repository" {
  type        = string
  description = "GitHub repository in 'owner/repo' format that is allowed to assume the deploy role."
}

variable "deploy_role_name" {
  type        = string
  description = "Name of the IAM role created for GitHub Actions deployments."
}

variable "bucket_arn" {
  type        = string
  description = "ARN of the S3 bucket the deploy role may read/write."
}

variable "cloudfront_distribution_arn" {
  type        = string
  description = "ARN of the CloudFront distribution the deploy role may invalidate."
}

variable "tags" {
  type        = map(string)
  description = "Tags applied to all resources created by this module."
}

variable "create_oidc_provider" {
  type        = bool
  description = "Set to false when the GitHub Actions OIDC provider already exists in this account (only one is allowed per account)."
  default     = true
}

variable "oidc_provider_arn" {
  type        = string
  description = "ARN of an existing GitHub Actions OIDC provider. Required when create_oidc_provider = false."
  default     = ""

  validation {
    condition     = var.create_oidc_provider || var.oidc_provider_arn != ""
    error_message = "oidc_provider_arn must be provided when create_oidc_provider is false."
  }
}

variable "ref_condition" {
  type        = string
  description = "Value for the token.actions.githubusercontent.com:sub condition. Defaults to any tag push."
  default     = "ref:refs/tags/*"
}

locals {
  oidc_provider_arn = var.create_oidc_provider ? aws_iam_openid_connect_provider.github_actions[0].arn : var.oidc_provider_arn
}

data "aws_iam_policy_document" "github_actions_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [local.oidc_provider_arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_repository}:${var.ref_condition}"]
    }
  }
}

data "aws_iam_policy_document" "github_actions_deploy" {
  statement {
    sid    = "ManageWebsiteBucket"
    effect = "Allow"
    actions = [
      "s3:GetBucketLocation",
      "s3:ListBucket",
      "s3:ListBucketMultipartUploads",
    ]
    resources = [
      var.bucket_arn,
    ]
  }

  statement {
    sid    = "ManageWebsiteObjects"
    effect = "Allow"
    actions = [
      "s3:AbortMultipartUpload",
      "s3:DeleteObject",
      "s3:GetObject",
      "s3:ListMultipartUploadParts",
      "s3:PutObject",
    ]
    resources = [
      "${var.bucket_arn}/*",
    ]
  }

  statement {
    sid    = "InvalidateCloudFront"
    effect = "Allow"
    actions = [
      "cloudfront:CreateInvalidation",
      "cloudfront:GetDistribution",
      "cloudfront:GetDistributionConfig",
      "cloudfront:GetInvalidation",
      "cloudfront:ListInvalidations",
    ]
    resources = [
      var.cloudfront_distribution_arn,
    ]
  }
}

resource "aws_iam_openid_connect_provider" "github_actions" {
  count = var.create_oidc_provider ? 1 : 0

  url = "https://token.actions.githubusercontent.com"

  client_id_list = [
    "sts.amazonaws.com",
  ]

  tags = var.tags
}

resource "aws_iam_role" "github_actions_deploy" {
  name               = var.deploy_role_name
  assume_role_policy = data.aws_iam_policy_document.github_actions_assume_role.json
  tags               = var.tags
}

resource "aws_iam_policy" "github_actions_deploy" {
  name   = var.deploy_role_name
  policy = data.aws_iam_policy_document.github_actions_deploy.json
  tags   = var.tags
}

resource "aws_iam_role_policy_attachment" "github_actions_deploy" {
  role       = aws_iam_role.github_actions_deploy.name
  policy_arn = aws_iam_policy.github_actions_deploy.arn
}

output "role_arn" {
  value       = aws_iam_role.github_actions_deploy.arn
  description = "ARN of the IAM role assumed by GitHub Actions for deployments."
}

output "oidc_provider_arn" {
  value       = local.oidc_provider_arn
  description = "ARN of the GitHub Actions OIDC provider (created or passed in)."
}
