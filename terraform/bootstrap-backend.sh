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
