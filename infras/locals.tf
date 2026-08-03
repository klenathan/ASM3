locals {
  name = "${var.project_name}-${var.environment}"
  api_origin = var.api_custom_domain_name == null ? (
    aws_apigatewayv2_api.backend.api_endpoint
  ) : "https://${aws_apigatewayv2_domain_name.public[0].domain_name}"
  web_origin = "https://${aws_amplify_branch.web.branch_name}.${aws_amplify_app.web.default_domain}"

  common_tags = {
    Project     = var.project_name
    Environment = var.environment
    Owner       = var.owner
    ManagedBy   = "OpenTofu"
  }

  # Content-analysis Lambda references. try() keeps these empty strings when
  # the function is disabled (count = 0), so the backend task can still plan.
  content_analysis_function  = var.enable_content_analysis_lambda ? try(aws_lambda_function.content_analysis[0].function_name, "") : ""
  content_analysis_qualifier = var.enable_content_analysis_lambda ? try(aws_lambda_alias.content_analysis[0].name, "") : ""
  content_analysis_model_id  = var.enable_content_analysis_lambda ? var.content_analysis_openrouter_model : ""
}

data "aws_caller_identity" "current" {}

data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_ssm_parameter" "ecs_ami" {
  name = "/aws/service/ecs/optimized-ami/amazon-linux-2023/recommended/image_id"
}
