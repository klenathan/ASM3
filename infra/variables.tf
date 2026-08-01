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
