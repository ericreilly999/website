Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# NOTE: Remote backend migration
# If this is the first time running after the S3 backend was added to main.tf,
# you must first run the bootstrap script to create the backend resources:
#
#   bash terraform/bootstrap-backend.sh
#
# Then run the ONE-TIME migration (replaces the plain `terraform init` below):
#
#   cd terraform
#   terraform init -migrate-state
#
# Terraform will prompt you to confirm — type 'yes'.
# After a successful migration you can delete terraform/terraform.tfstate locally
# (it is gitignored, but removing it prevents accidental reuse).
#
# On subsequent runs this script handles init normally.

$exportedCredentials = aws configure export-credentials --format powershell | Out-String
Invoke-Expression $exportedCredentials

terraform init

if ($LASTEXITCODE -ne 0) {
  throw "terraform init failed with exit code $LASTEXITCODE"
}

terraform plan -out website.tfplan

if ($LASTEXITCODE -ne 0) {
  throw "terraform plan failed with exit code $LASTEXITCODE"
}
