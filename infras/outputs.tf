output "site_url" {
  description = "Public HTTPS URL for the React application through API Gateway."
  value       = local.public_origin
}

output "api_url" {
  description = "Public HTTPS API Gateway origin. The client appends /api/v1 paths."
  value       = local.public_origin
}

output "api_custom_domain_target" {
  description = "API Gateway DNS target for an optional custom-domain CNAME or Route 53 alias record."
  value       = var.api_custom_domain_name == null ? null : aws_apigatewayv2_domain_name.public[0].domain_name_configuration[0].target_domain_name
}

output "api_custom_domain_hosted_zone_id" {
  description = "API Gateway hosted zone ID for an optional Route 53 alias record."
  value       = var.api_custom_domain_name == null ? null : aws_apigatewayv2_domain_name.public[0].domain_name_configuration[0].hosted_zone_id
}

output "web_ecr_repository_url" {
  description = "ECR repository URL for the web server image."
  value       = aws_ecr_repository.web.repository_url
}

output "media_bucket_name" {
  description = "Public S3 bucket used for uploaded media."
  value       = aws_s3_bucket.media.id
}

output "backend_ecr_repository_url" {
  description = "ECR repository URL for the backend image."
  value       = aws_ecr_repository.backend.repository_url
}

output "ecs_cluster_name" {
  description = "ECS cluster used by deployment commands."
  value       = aws_ecs_cluster.this.name
}

output "ecs_service_name" {
  description = "ECS backend service used by deployment commands."
  value       = aws_ecs_service.backend.name
}

output "database_url_secret_arn" {
  description = "Secrets Manager ARN containing DATABASE_URL."
  value       = aws_secretsmanager_secret.database_url.arn
}
