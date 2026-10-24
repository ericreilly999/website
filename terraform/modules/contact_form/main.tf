# Contact-form backend: Lambda (supported runtime) behind an API Gateway HTTP
# API, a least-privilege execution role and SES identities. Replaces the
# console-built `contact-form-prod` stack (inventory section 2.3).
#
# The route is POST /contact on stage `prod`, so the invoke URL keeps the same
# path shape as today (https://<api-id>.execute-api.<region>.amazonaws.com/prod/contact).

terraform {
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
}

variable "name" {
  type        = string
  description = "Base name for the Lambda, role, API and log groups (e.g. contact-form-prod)."
}

variable "to_email" {
  type        = string
  description = "Address that receives contact-form submissions. Verified as an SES identity."
}

variable "from_email" {
  type        = string
  description = "Sender address used by the Lambda. Verified as an SES identity."
}

variable "allowed_origins" {
  type        = list(string)
  description = "Origins allowed by CORS (for example https://example.com)."
}

variable "runtime" {
  type        = string
  description = "Lambda runtime. Must be a currently supported Node.js runtime."
  default     = "nodejs22.x"

  validation {
    condition     = can(regex("^nodejs(20|22|24)\\.x$", var.runtime))
    error_message = "runtime must be a supported Node.js runtime (nodejs20.x, nodejs22.x or nodejs24.x)."
  }
}

variable "throttle_burst_limit" {
  type        = number
  description = "API stage burst limit (requests)."
  default     = 10
}

variable "throttle_rate_limit" {
  type        = number
  description = "API stage steady-state limit (requests per second)."
  default     = 2
}

variable "log_retention_days" {
  type        = number
  description = "CloudWatch Logs retention for the Lambda and API access logs."
  default     = 30
}

variable "tags" {
  type        = map(string)
  description = "Tags applied to all resources created by this module."
}

locals {
  identities = toset([var.to_email, var.from_email])
}

# SES identities. The owner of each mailbox must click the verification email
# after the first apply (owner card T3-4). In the SES sandbox both sender and
# recipient must be verified, which is why both are created.
resource "aws_sesv2_email_identity" "this" {
  for_each       = local.identities
  email_identity = each.value
  tags           = var.tags
}

data "archive_file" "lambda" {
  type        = "zip"
  source_dir  = "${path.module}/src"
  output_path = "${path.module}/build/${var.name}.zip"
}

resource "aws_cloudwatch_log_group" "lambda" {
  name              = "/aws/lambda/${var.name}"
  retention_in_days = var.log_retention_days
  tags              = var.tags
}

data "aws_iam_policy_document" "lambda_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

data "aws_iam_policy_document" "lambda" {
  statement {
    sid       = "WriteOwnLogs"
    effect    = "Allow"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.lambda.arn}:*"]
  }

  # Scoped to the verified sender identity only (the console-built role allows "*").
  # SES v2 SendEmail also authorizes the recipient identity while in the sandbox.
  statement {
    sid     = "SendFromVerifiedIdentities"
    effect  = "Allow"
    actions = ["ses:SendEmail"]
    resources = [
      for identity in aws_sesv2_email_identity.this : identity.arn
    ]
  }
}

resource "aws_iam_role" "lambda" {
  name               = "${var.name}-lambda"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
  tags               = var.tags
}

resource "aws_iam_role_policy" "lambda" {
  name   = "${var.name}-lambda"
  role   = aws_iam_role.lambda.id
  policy = data.aws_iam_policy_document.lambda.json
}

resource "aws_lambda_function" "this" {
  function_name    = var.name
  role             = aws_iam_role.lambda.arn
  runtime          = var.runtime
  handler          = "index.handler"
  filename         = data.archive_file.lambda.output_path
  source_code_hash = data.archive_file.lambda.output_base64sha256
  timeout          = 10
  memory_size      = 128
  tags             = var.tags

  environment {
    variables = {
      TO_EMAIL        = var.to_email
      FROM_EMAIL      = var.from_email
      ALLOWED_ORIGINS = join(",", var.allowed_origins)
    }
  }

  depends_on = [aws_cloudwatch_log_group.lambda, aws_iam_role_policy.lambda]
}

resource "aws_apigatewayv2_api" "this" {
  name          = var.name
  protocol_type = "HTTP"
  tags          = var.tags

  cors_configuration {
    allow_origins = var.allowed_origins
    allow_methods = ["POST", "OPTIONS"]
    allow_headers = ["content-type"]
    max_age       = 3600
  }
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/aws/apigateway/${var.name}"
  retention_in_days = var.log_retention_days
  tags              = var.tags
}

resource "aws_apigatewayv2_integration" "this" {
  api_id                 = aws_apigatewayv2_api.this.id
  integration_type       = "AWS_PROXY"
  integration_method     = "POST"
  integration_uri        = aws_lambda_function.this.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "contact" {
  api_id    = aws_apigatewayv2_api.this.id
  route_key = "POST /contact"
  target    = "integrations/${aws_apigatewayv2_integration.this.id}"
}

resource "aws_apigatewayv2_stage" "prod" {
  api_id      = aws_apigatewayv2_api.this.id
  name        = "prod"
  auto_deploy = true
  tags        = var.tags

  default_route_settings {
    throttling_burst_limit = var.throttle_burst_limit
    throttling_rate_limit  = var.throttle_rate_limit
  }

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api.arn
    format = jsonencode({
      requestId = "$context.requestId"
      ip        = "$context.identity.sourceIp"
      time      = "$context.requestTime"
      route     = "$context.routeKey"
      status    = "$context.status"
      latency   = "$context.responseLatency"
    })
  }
}

resource "aws_lambda_permission" "api" {
  statement_id  = "AllowInvokeFromHttpApi"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.this.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.this.execution_arn}/${aws_apigatewayv2_stage.prod.name}/POST/contact"
}

output "api_id" {
  value       = aws_apigatewayv2_api.this.id
  description = "HTTP API id."
}

output "invoke_url" {
  value       = "${aws_apigatewayv2_api.this.api_endpoint}/${aws_apigatewayv2_stage.prod.name}/contact"
  description = "Full POST URL of the contact endpoint (same path shape as the current console-built API)."
}

output "lambda_function_name" {
  value       = aws_lambda_function.this.function_name
  description = "Name of the contact-form Lambda function."
}
