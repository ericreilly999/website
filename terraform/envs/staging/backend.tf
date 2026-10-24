terraform {
  # use_lockfile (S3 native locking) is GA in 1.11; no DynamoDB table needed.
  required_version = ">= 1.11.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.4"
    }
  }

  # Partial configuration: the bucket (which embeds the website-staging account
  # id) and region are supplied at init time and never committed:
  #   terraform init -backend-config=backend.hcl
  # See backend.hcl.example.
  backend "s3" {
    key          = "website/staging/terraform.tfstate"
    encrypt      = true
    use_lockfile = true
  }
}

# Account that owns the stack. Pinned so a wrong credential set fails the plan
# instead of building the stack in the wrong account.
provider "aws" {
  region              = var.aws_region
  allowed_account_ids = [var.aws_account_id]
}

# Account that owns the DNS zone. With dns_assume_role_arn = null this is the
# same account as above (zone created in website-staging, e.g. a delegated
# subzone). Otherwise it assumes the narrow Platform record role.
provider "aws" {
  alias  = "dns"
  region = var.aws_region

  dynamic "assume_role" {
    for_each = var.dns_assume_role_arn == null ? [] : [var.dns_assume_role_arn]
    content {
      role_arn = assume_role.value
    }
  }
}
