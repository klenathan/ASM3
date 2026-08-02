locals {
  name = "${var.project_name}-${var.environment}"
  public_origin = var.api_custom_domain_name == null ? (
    aws_apigatewayv2_api.backend.api_endpoint
  ) : "https://${aws_apigatewayv2_domain_name.public[0].domain_name}"

  common_tags = {
    Project     = var.project_name
    Environment = var.environment
    Owner       = var.owner
    ManagedBy   = "OpenTofu"
  }
}

data "aws_caller_identity" "current" {}

data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_ssm_parameter" "ecs_ami" {
  name = "/aws/service/ecs/optimized-ami/amazon-linux-2023/recommended/image_id"
}
