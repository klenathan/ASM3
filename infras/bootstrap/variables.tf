variable "aws_region" {
  description = "AWS region for the state bucket."
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Project prefix used for the globally unique state bucket."
  type        = string
  default     = "rmit-society"
}

variable "owner" {
  description = "Resource owner tag, such as an RMIT student ID."
  type        = string
}
