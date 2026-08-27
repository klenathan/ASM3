resource "aws_ecs_cluster" "this" {
  name = local.name

  setting {
    name  = "containerInsights"
    value = "disabled"
  }
}

resource "aws_cloudwatch_log_group" "backend" {
  name              = "/ecs/${local.name}/backend"
  retention_in_days = var.log_retention_days
}

resource "aws_cloudwatch_log_group" "database_bootstrap" {
  name              = "/ecs/${local.name}/database-bootstrap"
  retention_in_days = var.log_retention_days
}

resource "aws_instance" "ecs" {
  ami                    = data.aws_ssm_parameter.ecs_ami.value
  instance_type          = var.ec2_instance_type
  subnet_id              = aws_subnet.public.id
  vpc_security_group_ids = [aws_security_group.ecs.id]
  iam_instance_profile   = data.aws_iam_instance_profile.learner_lab.name

  user_data = <<-EOT
    #!/bin/bash
    echo 'ECS_CLUSTER=${aws_ecs_cluster.this.name}' >> /etc/ecs/ecs.config
    echo 'ECS_ENABLE_TASK_IAM_ROLE=true' >> /etc/ecs/ecs.config
  EOT

  user_data_replace_on_change = true
  monitoring                  = false

  credit_specification {
    cpu_credits = "standard"
  }

  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 2
  }

  root_block_device {
    volume_type           = "gp3"
    volume_size           = 30
    encrypted             = true
    delete_on_termination = true
  }

  tags = { Name = "${local.name}-ecs" }
}

resource "aws_eip" "ecs" {
  domain   = "vpc"
  instance = aws_instance.ecs.id
  tags     = { Name = "${local.name}-ecs" }
}

locals {
  backend_env_vars = concat([
    { name = "NODE_ENV", value = "production" },
    { name = "HOST", value = "0.0.0.0" },
    { name = "PORT", value = "3000" },
    { name = "WEB_ORIGIN", value = local.web_origin },
    { name = "DATABASE_SSL", value = "true" },
    { name = "DATABASE_POOL_MAX", value = "5" },
    { name = "AWS_REGION", value = var.aws_region },
    { name = "MEDIA_BUCKET", value = aws_s3_bucket.media.bucket },
    { name = "THREAD_EVENTS_QUEUE_URL", value = aws_sqs_queue.thread_events.url },
    { name = "CONTENT_ANALYSIS_QUEUE_URL", value = aws_sqs_queue.content_analysis_reanalysis.url },
    { name = "CONTENT_ANALYSIS_MODE", value = var.enable_content_analysis_lambda ? var.content_analysis_mode : "off" },
    { name = "CONTENT_ANALYSIS_LAMBDA_FUNCTION", value = local.content_analysis_function },
    { name = "CONTENT_ANALYSIS_LAMBDA_QUALIFIER", value = local.content_analysis_qualifier },
    { name = "CONTENT_ANALYSIS_LAMBDA_ARN", value = "arn:aws:lambda:${var.aws_region}:${data.aws_caller_identity.current.account_id}:function:${local.content_analysis_function}:${local.content_analysis_qualifier}" },
    { name = "CONTENT_ANALYSIS_POLICY_VERSION", value = "v2" },
    { name = "CONTENT_ANALYSIS_PROMPT_VERSION", value = "v1" },
    { name = "CONTENT_ANALYSIS_AUTO_REMOVE_CONFIDENCE", value = tostring(var.content_analysis_auto_remove_confidence) },
    { name = "CONTENT_ANALYSIS_MODEL_ID", value = local.content_analysis_model_id },
    { name = "ANALYSIS_MAX_COMMENTS", value = "40" },
    { name = "ANALYSIS_TIMEOUT_MS", value = "50000" },
    ], var.enable_analytics_pipeline ? [
    { name = "ANALYTICS_GLUE_JOB_NAME", value = var.analytics_glue_job_name },
    { name = "ANALYTICS_SCHEDULER_SECRET", value = random_password.analytics_scheduler_secret[0].result },
    { name = "ANALYTICS_REFRESH_RECONCILE_INTERVAL_MS", value = tostring(var.analytics_refresh_reconcile_interval_ms) },
    { name = "ANALYTICS_REFRESH_MAX_PHASE_RETRIES", value = tostring(var.analytics_refresh_max_phase_retries) },
    { name = "ANALYTICS_REFRESH_STALE_AFTER_MS", value = tostring(var.analytics_refresh_stale_after_ms) },
  ] : [])
}

resource "aws_ecs_task_definition" "backend" {
  family                   = "${local.name}-backend"
  requires_compatibilities = ["EC2"]
  network_mode             = "host"
  cpu                      = "256"
  memory                   = "384"
  execution_role_arn       = data.aws_iam_role.learner_lab.arn
  task_role_arn            = data.aws_iam_role.learner_lab.arn

  container_definitions = jsonencode([{
    name      = "backend"
    image     = "${aws_ecr_repository.backend.repository_url}:${var.backend_image_tag}"
    essential = true
    cpu       = 256
    memory    = 384
    portMappings = [{
      containerPort = 3000
      hostPort      = 3000
      protocol      = "tcp"
    }]
    environment = local.backend_env_vars
    secrets = [{
      name      = "DATABASE_URL"
      valueFrom = aws_secretsmanager_secret.database_url.arn
    }]
    healthCheck = {
      command     = ["CMD-SHELL", "node -e \"fetch('http://127.0.0.1:3000/api/v1/health/live').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))\""]
      interval    = 30
      timeout     = 5
      retries     = 3
      startPeriod = 30
    }
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.backend.name
        awslogs-region        = var.aws_region
        awslogs-stream-prefix = "backend"
      }
    }
  }])
}

resource "aws_ecs_task_definition" "database_bootstrap" {
  family                   = "${local.name}-database-bootstrap"
  requires_compatibilities = ["EC2"]
  network_mode             = "host"
  cpu                      = "256"
  memory                   = "384"
  execution_role_arn       = data.aws_iam_role.learner_lab.arn
  task_role_arn            = data.aws_iam_role.learner_lab.arn

  container_definitions = jsonencode([{
    name      = "database-bootstrap"
    image     = "${aws_ecr_repository.backend.repository_url}:${var.backend_image_tag}-database-bootstrap"
    essential = true
    cpu       = 256
    memory    = 384
    environment = [
      { name = "NODE_ENV", value = "production" },
      { name = "DATABASE_SSL", value = "true" },
      { name = "DATABASE_POOL_MAX", value = "2" },
      { name = "AWS_REGION", value = var.aws_region },
      { name = "MEDIA_BUCKET", value = aws_s3_bucket.media.bucket },
      { name = "THREAD_EVENTS_QUEUE_URL", value = aws_sqs_queue.thread_events.url },
    ]
    secrets = [{
      name      = "DATABASE_URL"
      valueFrom = aws_secretsmanager_secret.database_url.arn
    }]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.database_bootstrap.name
        awslogs-region        = var.aws_region
        awslogs-stream-prefix = "database-bootstrap"
      }
    }
  }])
}

resource "aws_ecs_service" "backend" {
  name            = "backend"
  cluster         = aws_ecs_cluster.this.id
  task_definition = aws_ecs_task_definition.backend.arn
  desired_count   = var.app_desired_count
  launch_type     = "EC2"

  deployment_minimum_healthy_percent = 0
  deployment_maximum_percent         = 100
}