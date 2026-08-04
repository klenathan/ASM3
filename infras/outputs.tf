output "site_url" {
  description = "Public HTTPS URL for the React application through Amplify Hosting."
  value       = local.web_origin
}

output "api_url" {
  description = "Public HTTPS API Gateway origin. The client appends /api/v1 paths."
  value       = local.api_origin
}

output "api_custom_domain_target" {
  description = "API Gateway DNS target for an optional custom-domain CNAME or Route 53 alias record."
  value       = var.api_custom_domain_name == null ? null : aws_apigatewayv2_domain_name.public[0].domain_name_configuration[0].target_domain_name
}

output "api_custom_domain_hosted_zone_id" {
  description = "API Gateway hosted zone ID for an optional Route 53 alias record."
  value       = var.api_custom_domain_name == null ? null : aws_apigatewayv2_domain_name.public[0].domain_name_configuration[0].hosted_zone_id
}

output "amplify_app_id" {
  description = "Amplify app ID used by the manual frontend deployment script."
  value       = aws_amplify_app.web.id
}

output "amplify_branch_name" {
  description = "Amplify branch used by the manual frontend deployment script."
  value       = aws_amplify_branch.web.branch_name
}

output "media_bucket_name" {
  description = "Public S3 bucket used for uploaded media."
  value       = aws_s3_bucket.media.id
}

output "thread_events_queue_url" {
  description = "Standard SQS queue receiving thread.created events."
  value       = aws_sqs_queue.thread_events.url
}

output "thread_events_dlq_url" {
  description = "SQS dead-letter queue for repeatedly failing thread.created messages."
  value       = aws_sqs_queue.thread_events_dlq.url
}

output "content_analysis_reanalysis_queue_url" {
  description = "Standard SQS queue receiving moderator-triggered thread reanalysis jobs."
  value       = aws_sqs_queue.content_analysis_reanalysis.url
}

output "content_analysis_reanalysis_dlq_url" {
  description = "SQS dead-letter queue for repeatedly failing reanalysis jobs."
  value       = aws_sqs_queue.content_analysis_reanalysis_dlq.url
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

output "database_bootstrap_task_definition_arn" {
  description = "One-shot ECS task definition that applies migrations and seeds initial data."
  value       = aws_ecs_task_definition.database_bootstrap.arn
}

output "database_bootstrap_image_uri" {
  description = "ECR image URI expected by the one-shot database bootstrap task."
  value       = "${aws_ecr_repository.backend.repository_url}:${var.backend_image_tag}-database-bootstrap"
}

output "database_bootstrap_log_group_name" {
  description = "CloudWatch log group for one-shot migration and seed runs."
  value       = aws_cloudwatch_log_group.database_bootstrap.name
}

output "database_url_secret_arn" {
  description = "Secrets Manager ARN containing DATABASE_URL."
  value       = aws_secretsmanager_secret.database_url.arn
}

output "openrouter_api_key_secret_arn" {
  description = "Secrets Manager ARN that must contain the OpenRouter API key when content analysis is enabled."
  value       = try(aws_secretsmanager_secret.openrouter_api_key[0].arn, null)
}
