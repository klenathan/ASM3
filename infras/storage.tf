resource "aws_s3_bucket" "media" {
  bucket        = "${local.name}-media-${data.aws_caller_identity.current.account_id}"
  force_destroy = var.force_destroy_buckets
}

resource "aws_s3_bucket_public_access_block" "content" {
  bucket = aws_s3_bucket.media.id
  # Public media delivery is separate from the HTTPS web application.
  block_public_acls       = true
  block_public_policy     = false
  ignore_public_acls      = true
  restrict_public_buckets = false
}

data "aws_iam_policy_document" "media_public_read" {
  statement {
    sid       = "AllowPublicMediaRead"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.media.arn}/*"]

    principals {
      type        = "*"
      identifiers = ["*"]
    }
  }

  # Learner Lab blocks modifying LabRole. Grant only media-object operations
  # through the bucket policy, matching the role assigned to ECS tasks.
  statement {
    sid = "AllowApplicationMediaManagement"
    actions = [
      "s3:DeleteObject",
      "s3:GetObject",
      "s3:PutObject",
    ]
    resources = ["${aws_s3_bucket.media.arn}/media/*"]

    principals {
      type        = "AWS"
      identifiers = [data.aws_iam_role.learner_lab.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "media" {
  bucket     = aws_s3_bucket.media.id
  policy     = data.aws_iam_policy_document.media_public_read.json
  depends_on = [aws_s3_bucket_public_access_block.content]
}

resource "aws_s3_bucket_versioning" "content" {
  bucket = aws_s3_bucket.media.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "content" {
  bucket = aws_s3_bucket.media.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "content" {
  bucket = aws_s3_bucket.media.id

  rule {
    id     = "cleanup-old-versions"
    status = "Enabled"

    filter {}

    expiration {
      expired_object_delete_marker = true
    }

    noncurrent_version_expiration {
      noncurrent_days = 30
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }

  # Remove direct uploads that were never completed (orphaned "pending" objects).
  # S3 cannot see application state, so any media object older than the configured
  # window is expired; a browser that abandons an upload leaves an object here that
  # this rule cleans up automatically.
  rule {
    id     = "expire-abandoned-uploads"
    status = "Enabled"

    filter {
      prefix = "media/"
    }

    expiration {
      days = var.media_abandoned_object_days
    }
  }
}

resource "aws_s3_bucket_cors_configuration" "media" {
  bucket = aws_s3_bucket.media.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "HEAD", "PUT"]
    allowed_origins = distinct(concat([local.web_origin], var.media_cors_allowed_origins))
    expose_headers  = ["ETag"]
    max_age_seconds = 3600
  }
}

resource "aws_ecr_repository" "backend" {
  name                 = "${local.name}-backend"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }
}

resource "aws_ecr_lifecycle_policy" "backend" {
  repository = aws_ecr_repository.backend.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Expire untagged images after one day"
      selection = {
        tagStatus   = "untagged"
        countType   = "sinceImagePushed"
        countUnit   = "days"
        countNumber = 1
      }
      action = { type = "expire" }
      }, {
      rulePriority = 2
      description  = "Keep the three newest images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 3
      }
      action = { type = "expire" }
    }]
  })
}
