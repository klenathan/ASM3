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

output "database_endpoint" {
  value = aws_db_instance.main.address
}

output "media_bucket" {
  value = aws_s3_bucket.media.id
}

output "media_cdn_url" {
  value = "https://${aws_cloudfront_distribution.media.domain_name}"
}

output "queues" {
  value = {
    moderation = aws_sqs_queue.moderation.url
    image      = aws_sqs_queue.image.url
    events     = aws_sqs_queue.events.url
  }
}
