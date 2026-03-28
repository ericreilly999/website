Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

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
