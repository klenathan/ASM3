output "state_bucket_name" {
  description = "Bucket supplied to the root stack's partial S3 backend."
  value       = aws_s3_bucket.state.id
}
