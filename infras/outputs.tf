output "site_url" {
  description = "Public CloudFront URL for the React application."
  value       = "https://${aws_cloudfront_distribution.this.domain_name}"
}

output "api_url" {
  description = "Public API base URL routed through CloudFront."
  value       = "https://${aws_cloudfront_distribution.this.domain_name}/api/v1"
}

output "web_bucket_name" {
  description = "S3 bucket to which the built web client is uploaded."
  value       = aws_s3_bucket.web.id
}

output "media_bucket_name" {
  description = "Private S3 bucket used for uploaded media."
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
