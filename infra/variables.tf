variable "project_name" {
  type    = string
  default = "rmit-society"
}

variable "stage" {
  type    = string
  default = "dev"
}

variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "availability_zone" {
  type        = string
  description = "One AZ is used to avoid NAT and multi-AZ charges."
  default     = "us-east-1a"
}

variable "database_availability_zone" {
  type        = string
  description = "Second AZ required by the RDS subnet group; the RDS instance remains single-AZ."
  default     = "us-east-1b"
}

variable "db_name" {
  type    = string
  default = "rmit_society"
}

variable "db_username" {
  type    = string
  default = "rmit_society"
}

variable "db_password" {
  type        = string
  description = "RDS master password. Avoid single quotes because it is passed to the container as an environment variable."
  sensitive   = true
}

variable "db_instance_class" {
  type    = string
  default = "db.t3.micro"
}

variable "db_allocated_storage" {
  type    = number
  default = 20
}

variable "backend_image" {
  type        = string
  description = "Immutable ECR image URI. Leave empty to provision the host only."
  default     = ""
}

variable "instance_type" {
  type    = string
  default = "t3.micro"
}

variable "ssh_cidr" {
  type        = string
  description = "Optional SSH source range. Leave empty to disable SSH ingress."
  default     = ""
}

variable "web_bucket_name" {
  type        = string
  description = "Optional globally unique name for the static website bucket."
  default     = ""
}
