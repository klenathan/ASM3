resource "random_password" "database" {
  length  = 32
  special = false
}

resource "aws_db_subnet_group" "this" {
  name       = local.name
  subnet_ids = aws_subnet.database[*].id
  tags       = { Name = "${local.name}-database" }
}

resource "aws_db_instance" "this" {
  identifier = local.name

  engine         = "postgres"
  engine_version = "16"
  instance_class = var.db_instance_class

  allocated_storage = 20
  storage_type      = "gp3"
  storage_encrypted = true

  db_name  = var.db_name
  username = var.db_username
  password = random_password.database.result
  port     = 5432

  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [aws_security_group.database.id]
  publicly_accessible    = false
  multi_az               = false

  backup_retention_period    = 1
  maintenance_window         = "sun:16:00-sun:17:00"
  backup_window              = "14:00-15:00"
  auto_minor_version_upgrade = true

  deletion_protection       = var.environment == "prod"
  skip_final_snapshot       = var.environment != "prod"
  final_snapshot_identifier = var.environment == "prod" ? "${local.name}-final" : null

  apply_immediately = var.environment != "prod"

  tags = { Name = local.name }
}

resource "aws_secretsmanager_secret" "database_url" {
  name                    = "${local.name}/database-url"
  description             = "PostgreSQL connection URL consumed by the ECS task"
  recovery_window_in_days = var.environment == "prod" ? 7 : 0
}

resource "aws_secretsmanager_secret_version" "database_url" {
  secret_id = aws_secretsmanager_secret.database_url.id
  secret_string = format(
    "postgresql://%s:%s@%s:%s/%s",
    var.db_username,
    random_password.database.result,
    aws_db_instance.this.address,
    aws_db_instance.this.port,
    var.db_name,
  )
}

# The secret value is intentionally not managed by OpenTofu. Populate it after
# apply with `aws secretsmanager put-secret-value` so the API key is not stored
# in Terraform configuration or state.
resource "aws_secretsmanager_secret" "openrouter_api_key" {
  count = var.enable_content_analysis_lambda ? 1 : 0

  name                    = "${local.name}/openrouter-api-key"
  description             = "OpenRouter API key consumed by the content-analysis Lambda"
  recovery_window_in_days = var.environment == "prod" ? 7 : 0
  tags                    = local.common_tags
}
