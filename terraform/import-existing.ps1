Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$exportedCredentials = aws configure export-credentials --format powershell | Out-String
Invoke-Expression $exportedCredentials

function Invoke-Terraform {
  param(
    [Parameter(Mandatory = $true)]
    [string[]] $Arguments
  )

  & terraform @Arguments

  if ($LASTEXITCODE -ne 0) {
    throw "terraform $($Arguments -join ' ') failed with exit code $LASTEXITCODE"
  }
}

Invoke-Terraform @("init")

Invoke-Terraform @("import", "module.certificate_zone.aws_route53_zone.website", "Z09302003LDW15NJ86V5W")
Invoke-Terraform @("import", "module.static_site.aws_s3_bucket.website", "ericreilly.com-prod")
Invoke-Terraform @("import", "module.static_site.aws_s3_bucket_public_access_block.website", "ericreilly.com-prod")
Invoke-Terraform @("import", "module.static_site.aws_s3_bucket_ownership_controls.website", "ericreilly.com-prod")
Invoke-Terraform @("import", "module.static_site.aws_s3_bucket_server_side_encryption_configuration.website", "ericreilly.com-prod")
Invoke-Terraform @("import", "module.static_site.aws_s3_bucket_website_configuration.website", "ericreilly.com-prod")
Invoke-Terraform @("import", "module.static_site.aws_s3_bucket_policy.website", "ericreilly.com-prod")
Invoke-Terraform @("import", "module.certificate_zone.aws_acm_certificate.website", "arn:aws:acm:us-east-1:290993374431:certificate/756e2d67-7ae2-4b63-9405-ff3239198e02")
Invoke-Terraform @("import", "module.static_site.aws_cloudfront_distribution.website", "EU0P2OBAYXZSI")
Invoke-Terraform @("import", "module.dns_aliases.aws_route53_record.website_alias_a", "Z09302003LDW15NJ86V5W_ericreilly.com_A")
Invoke-Terraform @("import", "module.dns_aliases.aws_route53_record.website_alias_aaaa", "Z09302003LDW15NJ86V5W_ericreilly.com_AAAA")
Invoke-Terraform @("import", "module.dns_aliases.aws_route53_record.www_alias_a", "Z09302003LDW15NJ86V5W_www.ericreilly.com_A")
Invoke-Terraform @("import", 'module.certificate_zone.aws_route53_record.certificate_validation[\"ericreilly.com\"]', "Z09302003LDW15NJ86V5W__f15afef646f2cbdf73bb5742c913359d.ericreilly.com_CNAME")
Invoke-Terraform @("import", 'module.certificate_zone.aws_route53_record.certificate_validation[\"www.ericreilly.com\"]', "Z09302003LDW15NJ86V5W__926b1b1f218cfefd3ca304a597ff9894.www.ericreilly.com_CNAME")
