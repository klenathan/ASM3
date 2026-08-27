# ---------------------------------------------------------------------------
# Analytics pipeline: EMR Serverless-powered platform metrics
#
# A nightly EMR Serverless pipeline that:
#   1. dump-rds Lambda reads RDS and exports JSONL to S3 (staging)
#   2. start-serverless Lambda starts EMR Serverless Spark job (StartJobRun)
#      polling GetJobRun every 30s with 900s timeout, CancelJobRun on timeout
#   3. load-results Lambda reads EMR Serverless output and upserts into analytics_metrics
#
# GATE: Analytics is gated by enable_analytics_pipeline. The feature requires:
#   - LabRole trust for lambda.amazonaws.com and emr-serverless.amazonaws.com
#   - EMR Serverless available in us-east-1 (verified)
#   - EventBridge can invoke Lambda
# All three Lambdas reuse LabRole (no IAM role creation needed).
# Cost: Serverless bills only for vCPU/memory seconds while Spark runs
# (~3 vCPU: driver 1 vCPU/3GB + executor 2 vCPU/4GB x1), auto-stop 15m idle.
# ---------------------------------------------------------------------------

# ── Feature flag ──────────────────────────────────────────────────────────
variable "enable_analytics_pipeline" {
  description = "Deploy the EMR Serverless analytics pipeline (dump-rds, start-serverless, load-results Lambda functions, EventBridge schedule, EMR Serverless app)."
  type        = bool
  default     = false
}

variable "enable_legacy_analytics_schedule" {
  description = "Keep the pre-migration EMR/Lambda nightly trigger available for rollback."
  type        = bool
  default     = false
}

variable "analytics_dump_rds_zip" {
  description = "Path to the built dump-rds Lambda zip."
  type        = string
  default     = "../backend/dist-function/analytics-dump-rds.zip"
}

variable "analytics_start_emr_zip" {
  description = "Path to the built start-serverless Lambda zip (kept as analytics_start_emr_zip for backward compat; file is built as analytics-start-serverless.zip or analytics-start-emr.zip)."
  type        = string
  default     = "../backend/dist-function/analytics-start-emr.zip"
}

# New canonical variable for Serverless; if set, it overrides analytics_start_emr_zip
variable "analytics_start_serverless_zip" {
  description = "Path to the built start-serverless Lambda zip (preferred). If set, used instead of analytics_start_emr_zip."
  type        = string
  default     = null
}

variable "analytics_load_results_zip" {
  description = "Path to the built load-results Lambda zip."
  type        = string
  default     = "../backend/dist-function/analytics-load-results.zip"
}

variable "analytics_pyspark_script_path" {
  description = "Path to the PySpark script deployed to S3."
  type        = string
  default     = "../backend/src/functions/analytics/pyspark/compute_metrics.py"
}

locals {
  analytics_start_zip = coalesce(var.analytics_start_serverless_zip, var.analytics_start_emr_zip)
}

# ── S3 bucket for analytics data ──────────────────────────────────────────
resource "aws_s3_bucket" "analytics" {
  count = var.enable_analytics_pipeline ? 1 : 0

  bucket        = "${local.name}-analytics-${data.aws_caller_identity.current.account_id}"
  force_destroy = var.force_destroy_buckets

  tags = local.common_tags
}

resource "aws_s3_bucket_public_access_block" "analytics" {
  count = var.enable_analytics_pipeline ? 1 : 0

  bucket = aws_s3_bucket.analytics[0].id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "analytics" {
  count = var.enable_analytics_pipeline ? 1 : 0

  bucket = aws_s3_bucket.analytics[0].id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Allow LabRole to read/write analytics data
data "aws_iam_policy_document" "analytics_bucket" {
  count = var.enable_analytics_pipeline ? 1 : 0

  statement {
    sid = "AllowLabRoleAnalyticsAccess"
    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:DeleteObject",
      "s3:ListBucket",
    ]
    resources = [
      aws_s3_bucket.analytics[0].arn,
      "${aws_s3_bucket.analytics[0].arn}/*",
    ]

    principals {
      type        = "AWS"
      identifiers = [data.aws_iam_role.learner_lab.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "analytics" {
  count = var.enable_analytics_pipeline ? 1 : 0

  bucket     = aws_s3_bucket.analytics[0].id
  policy     = data.aws_iam_policy_document.analytics_bucket[0].json
  depends_on = [aws_s3_bucket_public_access_block.analytics]
}

# ── PySpark script upload ─────────────────────────────────────────────────
resource "aws_s3_object" "pyspark_script" {
  count = var.enable_analytics_pipeline ? 1 : 0

  bucket = aws_s3_bucket.analytics[0].id
  key    = "analytics/pyspark/compute_metrics.py"
  source = var.analytics_pyspark_script_path
  etag   = filemd5(var.analytics_pyspark_script_path)

  tags = local.common_tags
}

# ── EMR Serverless application ────────────────────────────────────────────
resource "aws_emrserverless_application" "analytics" {
  count = var.enable_analytics_pipeline ? 1 : 0

  name          = "${local.name}-analytics"
  release_label = "emr-7.2.0"
  type          = "SPARK"

  maximum_capacity {
    cpu    = "3 vCPU"
    memory = "7 GB"
    disk   = "20 GB"
  }

  auto_stop_configuration {
    enabled              = true
    idle_timeout_minutes = 15
  }

  auto_start_configuration {
    enabled = true
  }

  tags = local.common_tags
}

# ── Lambda functions ──────────────────────────────────────────────────────

# Shared security group for VPC-attached Lambdas (dump-rds, load-results)
resource "aws_security_group" "analytics_lambda" {
  count = var.enable_analytics_pipeline ? 1 : 0

  name_prefix = "${local.name}-analytics-lambda-"
  description = "Analytics Lambda VPC egress (no ingress)"
  vpc_id      = aws_vpc.this.id

  egress {
    description     = "RDS access via database security group"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.database.id]
  }

  egress {
    description = "S3 and AWS API access"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${local.name}-analytics-lambda" }

  lifecycle { create_before_destroy = true }
}

# Allow analytics Lambdas in the VPC to reach RDS via the database security group
resource "aws_security_group_rule" "analytics_lambda_to_database" {
  count = var.enable_analytics_pipeline ? 1 : 0

  type                     = "ingress"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  security_group_id        = aws_security_group.database.id
  source_security_group_id = aws_security_group.analytics_lambda[0].id
  description              = "Analytics Lambda PostgreSQL access"
}

# ── dump-rds Lambda ───────────────────────────────────────────────────────
resource "aws_lambda_function" "analytics_dump_rds" {
  count = var.enable_analytics_pipeline ? 1 : 0

  function_name    = "${local.name}-analytics-dump-rds"
  role             = data.aws_iam_role.learner_lab.arn
  handler          = "index.handler"
  runtime          = "nodejs22.x"
  filename         = var.analytics_dump_rds_zip
  source_code_hash = filebase64sha256(var.analytics_dump_rds_zip)
  publish          = true

  architectures = ["x86_64"]
  memory_size   = 256
  timeout       = 300

  vpc_config {
    subnet_ids         = aws_subnet.database[*].id
    security_group_ids = [aws_security_group.analytics_lambda[0].id]
  }

  environment {
    variables = {
      DATABASE_URL   = aws_secretsmanager_secret.database_url.name
      STAGING_BUCKET = aws_s3_bucket.analytics[0].bucket
      STAGING_PREFIX = "analytics/staging"
      LOG_LEVEL      = "info"
    }
  }

  logging_config {
    log_format = "Text"
    log_group  = aws_cloudwatch_log_group.analytics_dump_rds[0].name
  }

  tags = local.common_tags
}

resource "aws_cloudwatch_log_group" "analytics_dump_rds" {
  count = var.enable_analytics_pipeline ? 1 : 0

  name              = "/aws/lambda/${local.name}-analytics-dump-rds"
  retention_in_days = var.log_retention_days
  tags              = local.common_tags
}

# ── start-serverless Lambda ───────────────────────────────────────────────
resource "aws_lambda_function" "analytics_start_emr" {
  count = var.enable_analytics_pipeline ? 1 : 0

  # Keep resource address analytics_start_emr for state compat; actual
  # Lambda function name uses new Serverless naming.
  function_name    = "${local.name}-analytics-start-serverless"
  role             = data.aws_iam_role.learner_lab.arn
  handler          = "index.handler"
  runtime          = "nodejs22.x"
  filename         = local.analytics_start_zip
  source_code_hash = filebase64sha256(local.analytics_start_zip)
  publish          = true

  architectures = ["x86_64"]
  memory_size   = 256
  timeout       = 900 # 15 minutes for Serverless job polling (900s timeout)

  environment {
    variables = {
      APPLICATION_ID       = aws_emrserverless_application.analytics[0].id
      EXECUTION_ROLE_ARN   = data.aws_iam_role.learner_lab.arn
      STAGING_BUCKET       = aws_s3_bucket.analytics[0].bucket
      STAGING_PREFIX       = "analytics/staging"
      OUTPUT_BUCKET        = aws_s3_bucket.analytics[0].bucket
      OUTPUT_PREFIX        = "analytics/output"
      SCRIPT_BUCKET        = aws_s3_bucket.analytics[0].bucket
      SCRIPT_KEY           = "analytics/pyspark/compute_metrics.py"
      LOG_BUCKET           = aws_s3_bucket.analytics[0].bucket
      LOG_PREFIX           = "analytics/emr-serverless-logs"
      JOB_POLL_INTERVAL_MS = "30000"
      JOB_TIMEOUT_MS       = "900000"
      LOG_LEVEL            = "info"
    }
  }

  logging_config {
    log_format = "Text"
    log_group  = aws_cloudwatch_log_group.analytics_start_emr[0].name
  }

  tags = local.common_tags
}

resource "aws_cloudwatch_log_group" "analytics_start_emr" {
  count = var.enable_analytics_pipeline ? 1 : 0

  name              = "/aws/lambda/${local.name}-analytics-start-serverless"
  retention_in_days = var.log_retention_days
  tags              = local.common_tags
}

# ── load-results Lambda ───────────────────────────────────────────────────
resource "aws_lambda_function" "analytics_load_results" {
  count = var.enable_analytics_pipeline ? 1 : 0

  function_name    = "${local.name}-analytics-load-results"
  role             = data.aws_iam_role.learner_lab.arn
  handler          = "index.handler"
  runtime          = "nodejs22.x"
  filename         = var.analytics_load_results_zip
  source_code_hash = filebase64sha256(var.analytics_load_results_zip)
  publish          = true

  architectures = ["x86_64"]
  memory_size   = 256
  timeout       = 120

  vpc_config {
    subnet_ids         = aws_subnet.database[*].id
    security_group_ids = [aws_security_group.analytics_lambda[0].id]
  }

  environment {
    variables = {
      DATABASE_URL  = aws_secretsmanager_secret.database_url.name
      OUTPUT_BUCKET = aws_s3_bucket.analytics[0].bucket
      OUTPUT_PREFIX = "analytics/output"
      LOG_LEVEL     = "info"
    }
  }

  logging_config {
    log_format = "Text"
    log_group  = aws_cloudwatch_log_group.analytics_load_results[0].name
  }

  tags = local.common_tags
}

resource "aws_cloudwatch_log_group" "analytics_load_results" {
  count = var.enable_analytics_pipeline ? 1 : 0

  name              = "/aws/lambda/${local.name}-analytics-load-results"
  retention_in_days = var.log_retention_days
  tags              = local.common_tags
}

# ── Lambda permissions (LabRole invoke) ───────────────────────────────────
resource "aws_lambda_permission" "analytics_dump_rds_invoke" {
  count = var.enable_legacy_analytics_schedule ? 1 : 0

  statement_id  = "AllowEventBridgeDump"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.analytics_dump_rds[0].function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.analytics_nightly[0].arn
}

resource "aws_lambda_permission" "analytics_dump_rds_api" {
  count = var.enable_analytics_pipeline ? 1 : 0

  statement_id  = "AllowApiGatewayDump"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.analytics_dump_rds[0].function_name
  principal     = "apigateway.amazonaws.com"
}

resource "aws_lambda_permission" "analytics_start_emr_invoke" {
  count = var.enable_analytics_pipeline ? 1 : 0

  statement_id  = "AllowS3TriggerStartEmr"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.analytics_start_emr[0].function_name
  principal     = "s3.amazonaws.com"
  source_arn    = aws_s3_bucket.analytics[0].arn
}

resource "aws_lambda_permission" "analytics_load_results_invoke" {
  count = var.enable_analytics_pipeline ? 1 : 0

  statement_id  = "AllowS3TriggerLoadResults"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.analytics_load_results[0].function_name
  principal     = "s3.amazonaws.com"
  source_arn    = aws_s3_bucket.analytics[0].arn
}

# Chain pipeline stages only after each stage writes its completion marker.
resource "aws_s3_bucket_notification" "analytics" {
  count  = var.enable_analytics_pipeline ? 1 : 0
  bucket = aws_s3_bucket.analytics[0].id

  lambda_function {
    lambda_function_arn = aws_lambda_function.analytics_start_emr[0].arn
    events              = ["s3:ObjectCreated:Put"]
    filter_prefix       = "analytics/staging/"
    filter_suffix       = "/_SUCCESS"
  }

  lambda_function {
    lambda_function_arn = aws_lambda_function.analytics_load_results[0].arn
    events              = ["s3:ObjectCreated:Put"]
    filter_prefix       = "analytics/output/"
    filter_suffix       = "/_SUCCESS"
  }

  depends_on = [
    aws_lambda_permission.analytics_start_emr_invoke,
    aws_lambda_permission.analytics_load_results_invoke,
  ]
}

# ── Nightly EventBridge schedule ──────────────────────────────────────────
resource "aws_cloudwatch_event_rule" "analytics_nightly" {
  count = var.enable_legacy_analytics_schedule ? 1 : 0

  name                = "${local.name}-analytics-nightly"
  description         = "Trigger analytics dump-rds Lambda nightly at 2 AM"
  schedule_expression = "cron(0 2 * * ? *)"
  tags                = local.common_tags
}

resource "aws_cloudwatch_event_target" "analytics_nightly" {
  count = var.enable_legacy_analytics_schedule ? 1 : 0

  rule = aws_cloudwatch_event_rule.analytics_nightly[0].name
  arn  = aws_lambda_function.analytics_dump_rds[0].arn
}

# ── Outputs ───────────────────────────────────────────────────────────────
output "analytics_bucket" {
  value = try(aws_s3_bucket.analytics[0].id, null)
}

output "analytics_dump_rds_function" {
  value = try(aws_lambda_function.analytics_dump_rds[0].function_name, null)
}

output "analytics_start_emr_function" {
  value = try(aws_lambda_function.analytics_start_emr[0].function_name, null)
}

output "analytics_start_serverless_function" {
  value = try(aws_lambda_function.analytics_start_emr[0].function_name, null)
}

output "analytics_load_results_function" {
  value = try(aws_lambda_function.analytics_load_results[0].function_name, null)
}

output "analytics_emr_serverless_application_id" {
  value = try(aws_emrserverless_application.analytics[0].id, null)
}

output "analytics_emr_serverless_application_arn" {
  value = try(aws_emrserverless_application.analytics[0].arn, null)
}
