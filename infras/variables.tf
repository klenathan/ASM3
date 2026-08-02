variable "aws_region" {
  description = "AWS region in which to deploy the application."
  type        = string
  default     = "ap-southeast-2"
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

variable "web_origin" {
  description = "Exact HTTPS browser origin accepted by backend CORS. Use the CloudFront URL output after the first apply."
  type        = string
  default     = "https://example.invalid"

  validation {
    condition     = can(regex("^https://", var.web_origin))
    error_message = "web_origin must be an HTTPS origin."
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
  default     = 14
}

variable "force_destroy_buckets" {
  description = "Allow OpenTofu to delete non-empty content buckets during coursework teardown."
  type        = bool
  default     = false
}
