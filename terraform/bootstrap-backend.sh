#!/usr/bin/env bash
# bootstrap-backend.sh
#
# Creates the S3 bucket and DynamoDB table used as the Terraform remote backend.
# Safe to re-run — all operations are idempotent.
#
# Prerequisites:
#   - AWS CLI installed and configured with credentials that have permission to
#     create S3 buckets and DynamoDB tables in us-east-1.
#
# Usage:
#   bash terraform/bootstrap-backend.sh

set -euo pipefail

REGION="us-east-1"
BUCKET="ericreilly-website-tfstate"
TABLE="ericreilly-website-tfstate-lock"

# Tags applied to both backend resources. Same key/value *style* as
# `local.common_tags` in terraform/main.tf, but deliberately not the same key
# set — these are not Terraform-managed resources and do not belong to one
# environment:
#   - ManagedBy is "bootstrap-script", not "terraform": these two resources
#     hold the remote state itself, so they must exist before Terraform does
#     and are necessarily outside its management. Tagging them "terraform"
#     would misrepresent what manages them.
#   - Environment is omitted rather than guessed: this bucket and table back
#     *both* the prod and staging state, so no single environment value is
#     accurate. As a result they will not appear under an Environment facet
#     in Cost Explorer / the Resource Groups Tag Editor alongside the
#     Terraform-managed resources — Project is the facet that groups them.
#   - Purpose is added to make the "do not delete, this is state" intent
#     legible from the console without opening this script.
TAG_PROJECT="eric-reilly-website"
TAG_MANAGED_BY="bootstrap-script"
TAG_PURPOSE="terraform-state-backend"

echo "==> Bootstrapping Terraform remote backend in ${REGION}"

# ---------------------------------------------------------------------------
# S3 bucket
# ---------------------------------------------------------------------------
if aws s3api head-bucket --bucket "${BUCKET}" --region "${REGION}" 2>/dev/null; then
  echo "    S3 bucket '${BUCKET}' already exists — skipping creation"
else
  echo "    Creating S3 bucket '${BUCKET}'"
  aws s3api create-bucket \
    --bucket "${BUCKET}" \
    --region "${REGION}"
fi

echo "    Enabling versioning on '${BUCKET}'"
aws s3api put-bucket-versioning \
  --bucket "${BUCKET}" \
  --versioning-configuration Status=Enabled

echo "    Blocking all public access on '${BUCKET}'"
aws s3api put-public-access-block \
  --bucket "${BUCKET}" \
  --public-access-block-configuration \
    "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"

echo "    Enabling AES256 server-side encryption on '${BUCKET}'"
aws s3api put-bucket-encryption \
  --bucket "${BUCKET}" \
  --server-side-encryption-configuration '{
    "Rules": [{
      "ApplyServerSideEncryptionByDefault": {
        "SSEAlgorithm": "AES256"
      },
      "BucketKeyEnabled": true
    }]
  }'

echo "    Applying resource tags to '${BUCKET}'"
aws s3api put-bucket-tagging \
  --bucket "${BUCKET}" \
  --tagging "TagSet=[{Key=Project,Value=${TAG_PROJECT}},{Key=ManagedBy,Value=${TAG_MANAGED_BY}},{Key=Purpose,Value=${TAG_PURPOSE}}]"

# ---------------------------------------------------------------------------
# DynamoDB table
# ---------------------------------------------------------------------------
if aws dynamodb describe-table --table-name "${TABLE}" --region "${REGION}" 2>/dev/null | grep -q '"TableStatus"'; then
  echo "    DynamoDB table '${TABLE}' already exists — skipping creation"
else
  echo "    Creating DynamoDB table '${TABLE}'"
  aws dynamodb create-table \
    --table-name "${TABLE}" \
    --attribute-definitions AttributeName=LockID,AttributeType=S \
    --key-schema AttributeName=LockID,KeyType=HASH \
    --billing-mode PAY_PER_REQUEST \
    --region "${REGION}"

  echo "    Waiting for table to become ACTIVE..."
  aws dynamodb wait table-exists --table-name "${TABLE}" --region "${REGION}"
fi

echo "    Applying resource tags to '${TABLE}'"
TABLE_ARN="$(aws dynamodb describe-table \
  --table-name "${TABLE}" \
  --region "${REGION}" \
  --query 'Table.TableArn' \
  --output text)"
aws dynamodb tag-resource \
  --resource-arn "${TABLE_ARN}" \
  --region "${REGION}" \
  --tags "Key=Project,Value=${TAG_PROJECT}" \
         "Key=ManagedBy,Value=${TAG_MANAGED_BY}" \
         "Key=Purpose,Value=${TAG_PURPOSE}"

echo ""
echo "==> Backend resources are ready."
echo ""
echo "    Next steps (run once from the terraform/ directory):"
echo ""
echo "      1. The backend \"s3\" block is already present in main.tf."
echo "      2. Run the following to migrate your existing local state to S3:"
echo ""
echo "           cd terraform"
echo "           terraform init -migrate-state"
echo ""
echo "      Terraform will ask you to confirm the migration — type 'yes'."
echo "      After migration you can delete terraform/terraform.tfstate locally"
echo "      (it is already gitignored, but removing it prevents accidental reuse)."
