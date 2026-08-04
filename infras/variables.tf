variable "aws_region" {
  description = "AWS region in which to deploy the application."
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Short lowercase name used in resource names and tags."
  type        = string
  default     = "rmit-society"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,20}[a-z0-9]$", var.project_name))
    error_message = "project_name must be 3-22 lowercase letters, numbers, or hyphens and start with a letter."
  }
}

variable "environment" {
  description = "Deployment environment name."
  type        = string
  default     = "demo"

  validation {
    condition     = contains(["dev", "demo", "staging", "prod"], var.environment)
    error_message = "environment must be dev, demo, staging, or prod."
  }
}

variable "owner" {
  description = "Resource owner tag, such as an RMIT student ID."
  type        = string
}

variable "learner_lab_role_name" {
  description = "Pre-created IAM role supplied by AWS Academy Learner Lab."
  type        = string
  default     = "LabRole"
}

variable "learner_lab_instance_profile_name" {
  description = "Pre-created EC2 instance profile supplied by AWS Academy Learner Lab."
  type        = string
  default     = "LabInstanceProfile"
}

variable "api_custom_domain_name" {
  description = "Optional DNS name for the HTTPS API Gateway endpoint, such as community.example.com."
  type        = string
  default     = null
  nullable    = true

  validation {
    condition     = var.api_custom_domain_name == null || can(regex("^[A-Za-z0-9][A-Za-z0-9.-]*[A-Za-z0-9]$", var.api_custom_domain_name))
    error_message = "api_custom_domain_name must be a valid DNS name when provided."
  }
}

variable "api_custom_domain_certificate_arn" {
  description = "ACM certificate ARN for api_custom_domain_name. The certificate must be in aws_region."
  type        = string
  default     = null
  nullable    = true

  validation {
    condition     = (var.api_custom_domain_name == null) == (var.api_custom_domain_certificate_arn == null)
    error_message = "Set api_custom_domain_name and api_custom_domain_certificate_arn together."
  }
}

variable "vpc_cidr" {
  description = "CIDR block for the application VPC."
  type        = string
  default     = "10.42.0.0/16"
}

variable "ec2_instance_type" {
  description = "ECS container-instance type."
  type        = string
  default     = "t3.micro"
}

variable "db_instance_class" {
  description = "RDS PostgreSQL instance class."
  type        = string
  default     = "db.t4g.micro"
}

variable "db_name" {
  description = "Initial PostgreSQL database name."
  type        = string
  default     = "rmit_society"

  validation {
    condition     = can(regex("^[a-z][a-z0-9_]{0,62}$", var.db_name))
    error_message = "db_name must be a valid lowercase PostgreSQL identifier."
  }
}

variable "db_username" {
  description = "PostgreSQL administrator username."
  type        = string
  default     = "rmit_society"

  validation {
    condition     = can(regex("^[a-z][a-z0-9_]{0,62}$", var.db_username))
    error_message = "db_username must be a valid lowercase PostgreSQL identifier."
  }
}

variable "backend_image_tag" {
  description = "Backend ECR image tag deployed by ECS."
  type        = string
  default     = "latest"
}

variable "app_desired_count" {
  description = "Number of backend tasks. Keep at 0 until an image has been pushed to ECR."
  type        = number
  default     = 0

  validation {
    condition     = contains([0, 1], var.app_desired_count)
    error_message = "The single-host coursework stack supports an app_desired_count of 0 or 1."
  }
}

variable "log_retention_days" {
  description = "CloudWatch application log retention."
  type        = number
  default     = 7
}

variable "force_destroy_buckets" {
  description = "Allow OpenTofu to delete non-empty content buckets during coursework teardown."
  type        = bool
  default     = false
}

variable "media_cors_allowed_origins" {
  description = "Additional browser origins allowed to upload directly to the media bucket."
  type        = list(string)
  default     = ["http://localhost:5173"]
}

variable "media_abandoned_object_days" {
  description = "Days after which uncompleted direct uploads (orphaned pending objects) are expired by the S3 lifecycle rule."
  type        = number
  default     = 30
}

# ----- Lambda + OpenRouter content analysis (Phase 0 gated) -----------------
variable "enable_content_analysis_lambda" {
  description = "Deploy the content-analysis Lambda. Keep false until Phase 0 confirms LabRole trust, Secrets Manager access, and OpenRouter connectivity in the active lab."
  type        = bool
  default     = false
}

variable "content_analysis_mode" {
  description = "Content-analysis rollout mode. Use off, shadow, or enforce."
  type        = string
  default     = "off"

  validation {
    condition     = contains(["off", "shadow", "enforce"], var.content_analysis_mode)
    error_message = "content_analysis_mode must be off, shadow, or enforce."
  }
}

variable "content_analysis_zip_path" {
  description = "Path to the built Lambda bundle zip (backend/dist-function/content-analysis.zip)."
  type        = string
  default     = "../backend/dist-function/content-analysis.zip"
}

variable "content_analysis_openrouter_model" {
  description = "OpenRouter model slug for the DeepSeek analysis model. Use a vision-capable model when images are enabled."
  type        = string
  default     = ""
}

variable "content_analysis_memory" {
  description = "Lambda memory in MB for the content-analysis function."
  type        = number
  default     = 512
}

variable "content_analysis_timeout_seconds" {
  description = "Lambda timeout in seconds; must stay below the SQS visibility timeout."
  type        = number
  default     = 55
}

variable "content_analysis_reserved_concurrency" {
  description = "Lambda reserved concurrency; keep 1 for demo workloads."
  type        = number
  default     = 1
}

variable "content_analysis_max_model_tokens" {
  description = "Max output tokens for the OpenRouter model."
  type        = number
  default     = 2048
}

variable "content_analysis_max_images" {
  description = "Max images analyzed per request."
  type        = number
  default     = 4
}

variable "content_analysis_max_image_bytes" {
  description = "Max bytes for a single analyzed image. Matches the FE upload / backend media limit (10 MB)."
  type        = number
  default     = 10485760
}

variable "content_analysis_max_total_image_bytes" {
  description = "Max total bytes across all analyzed images (max_images x per-image limit)."
  type        = number
  default     = 41943040
}

variable "content_analysis_allowed_mime_types" {
  description = "Comma-separated MIME types the function will accept for images."
  type        = string
  default     = "image/jpeg,image/png,image/webp"
}
