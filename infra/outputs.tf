output "api_public_url" {
  value = "http://${aws_instance.api.public_ip}:8000"
}

output "web_url" {
  value = "http://${aws_s3_bucket_website_configuration.web.website_endpoint}"
}

output "web_bucket_name" {
  value = aws_s3_bucket.web.id
}

output "backend_repository" {
  value = aws_ecr_repository.backend.repository_url
}

output "dynamodb_table" {
  value = aws_dynamodb_table.main.name
}

output "media_bucket" {
  value = aws_s3_bucket.media.id
}

output "cognito" {
  value = {
    user_pool_id = aws_cognito_user_pool.main.id
    client_id    = aws_cognito_user_pool_client.web.id
  }
}

output "queues" {
  value = {
    moderation = aws_sqs_queue.moderation.url
    image      = aws_sqs_queue.image.url
    events     = aws_sqs_queue.events.url
  }
}
