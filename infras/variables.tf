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
