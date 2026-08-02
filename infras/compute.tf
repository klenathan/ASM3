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
    volume_type = "gp3"
    # The current ECS-optimized AMI snapshot has a 30 GiB root volume.
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
    environment = [
      { name = "NODE_ENV", value = "production" },
      { name = "HOST", value = "0.0.0.0" },
      { name = "PORT", value = "3000" },
      { name = "WEB_ORIGIN", value = local.web_origin },
      { name = "DATABASE_SSL", value = "true" },
      { name = "DATABASE_POOL_MAX", value = "5" },
      { name = "AWS_REGION", value = var.aws_region },
      { name = "MEDIA_BUCKET", value = aws_s3_bucket.media.bucket },
    ]
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

resource "aws_ecs_service" "backend" {
  name            = "backend"
  cluster         = aws_ecs_cluster.this.id
  task_definition = aws_ecs_task_definition.backend.arn
  desired_count   = var.app_desired_count
  launch_type     = "EC2"

  deployment_minimum_healthy_percent = 0
  deployment_maximum_percent         = 100

}
