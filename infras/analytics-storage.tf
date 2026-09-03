# ---------------------------------------------------------------------------
# Shared analytics storage.
#
# The managed Step Functions workflow and workflow Lambda use this bucket for
# Glue source snapshots, the snapshot manifest, temporary files, and Athena
# query results.

variable "enable_analytics_pipeline" {
  description = "Deploy the gated Glue + Athena analytics pipeline and its shared S3 bucket."
  type        = bool
  default     = false
}

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

output "analytics_bucket" {
  description = "Private S3 bucket used by the gated Glue + Athena analytics pipeline."
  value       = try(aws_s3_bucket.analytics[0].id, null)
}
