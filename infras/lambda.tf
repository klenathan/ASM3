# ---------------------------------------------------------------------------
# Lambda + Bedrock content-analysis function.
#
# GATE: This whole file is inert until `enable_content_analysis_lambda` is set
# true (Phase 0 must first confirm, in the ACTIVE lab):
#   - LabRole trust policy permits `lambda.amazonaws.com` to assume it
#     (aws_lambda_function requires an execution role; Learner Lab blocks
#     iam:CreateRole, so we reuse LabRole).
#   - LabRole effective permissions include `bedrock:InvokeModel` and
#     `logs:CreateLogStream`/`logs:PutLogEvents`.
#   - The preferred multimodal Bedrock model is enabled for the account.
#
# Lambda stays OUTSIDE the VPC (no NAT, no VPC endpoints) and never connects
# to RDS. It only reads approved S3 objects and calls the Bedrock Runtime.
# No SQS event-source mapping; the ECS backend invokes it synchronously.
# ---------------------------------------------------------------------------

# Lambda execution role. LabRole already grants the ECS task s3:GetObject on
# `media/*` via the bucket policy, so assuming LabRole gives the function the
# same media-read access. Trust for lambda.amazonaws.com is the Phase 0 gate.
resource "aws_lambda_function" "content_analysis" {
  count = var.enable_content_analysis_lambda ? 1 : 0

  function_name    = "${local.name}-content-analysis"
  role             = data.aws_iam_role.learner_lab.arn
  handler          = "index.handler"
  runtime          = "nodejs22.x"
  filename         = var.content_analysis_zip_path
  source_code_hash = filebase64sha256(var.content_analysis_zip_path)
  publish          = true

  architectures = ["x86_64"]
  memory_size   = var.content_analysis_memory
  timeout       = var.content_analysis_timeout_seconds
  # Reserved concurrency caps demo cost while Bedrock/Lambda is being measured.
  reserved_concurrent_executions = var.content_analysis_reserved_concurrency

  environment {
    variables = {
      AWS_REGION            = var.aws_region
      BEDROCK_MODEL_ID      = var.content_analysis_bedrock_model_id
      ALLOWED_MEDIA_BUCKET  = aws_s3_bucket.media.bucket
      ALLOWED_MEDIA_PREFIX  = "media/"
      MAX_MODEL_TOKENS      = tostring(var.content_analysis_max_model_tokens)
      MAX_IMAGE_BYTES       = tostring(var.content_analysis_max_image_bytes)
      MAX_TOTAL_IMAGE_BYTES = tostring(var.content_analysis_max_total_image_bytes)
      MAX_IMAGES            = tostring(var.content_analysis_max_images)
      ALLOWED_MIME_TYPES    = var.content_analysis_allowed_mime_types
      LOG_LEVEL             = "info"
    }
  }

  logging_config {
    log_format = "Text"
    log_group  = aws_cloudwatch_log_group.content_analysis[0].name
  }

  tags = local.common_tags
}

# Immutable alias for reproducible audit evidence (stored per analysis run).
resource "aws_lambda_alias" "content_analysis" {
  count = var.enable_content_analysis_lambda ? 1 : 0

  name             = "prod"
  function_name    = aws_lambda_function.content_analysis[0].function_name
  function_version = aws_lambda_function.content_analysis[0].version
}

# Allow the ECS task (running as LabRole) to invoke the function. Learner Lab
# blocks attaching policies to roles, so use a resource-based policy instead.
resource "aws_lambda_permission" "content_analysis_invoke" {
  count = var.enable_content_analysis_lambda ? 1 : 0

  statement_id  = "AllowEcsTaskInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.content_analysis[0].function_name
  principal     = data.aws_iam_role.learner_lab.arn
  qualifier     = aws_lambda_alias.content_analysis[0].name
}

resource "aws_cloudwatch_log_group" "content_analysis" {
  count = var.enable_content_analysis_lambda ? 1 : 0

  name              = "/aws/lambda/${local.name}-content-analysis"
  retention_in_days = var.log_retention_days
  tags              = local.common_tags
}

output "content_analysis_function_name" {
  value = try(aws_lambda_function.content_analysis[0].function_name, null)
}

output "content_analysis_function_arn" {
  value = try(aws_lambda_function.content_analysis[0].arn, null)
}

output "content_analysis_alias_arn" {
  value = try(aws_lambda_alias.content_analysis[0].arn, null)
}
