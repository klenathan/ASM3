data "aws_caller_identity" "current" {}

data "aws_ami" "amazon_linux" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-*-x86_64"]
  }

  filter {
    name   = "state"
    values = ["available"]
  }
}

locals {
  name       = "${var.project_name}-${var.stage}"
  web_bucket = var.web_bucket_name != "" ? var.web_bucket_name : "${local.name}-${data.aws_caller_identity.current.account_id}-web"
  api_env = {
    ENVIRONMENT          = var.stage
    AWS_REGION           = var.aws_region
    DATABASE_DRIVER      = "dynamodb"
    DATABASE_AUTO_CREATE = "false"
    TABLE_NAME           = aws_dynamodb_table.main.name
    MEDIA_BUCKET         = aws_s3_bucket.media.id
    MODERATION_QUEUE_URL = aws_sqs_queue.moderation.url
    IMAGE_QUEUE_URL      = aws_sqs_queue.image.url
    EVENT_QUEUE_URL      = aws_sqs_queue.events.url
    CORS_ORIGINS         = "*"
    MODERATION_PROVIDER  = "aws"
    IMAGE_PROVIDER       = "aws"
    COGNITO_USER_POOL_ID = aws_cognito_user_pool.main.id
    COGNITO_AUDIENCE     = aws_cognito_user_pool_client.web.id
    COGNITO_ISSUER       = "https://cognito-idp.${var.aws_region}.amazonaws.com/${aws_cognito_user_pool.main.id}"
    COGNITO_JWKS_URL     = "https://cognito-idp.${var.aws_region}.amazonaws.com/${aws_cognito_user_pool.main.id}/.well-known/jwks.json"
  }
  image_registry = var.backend_image == "" ? "" : split("/", var.backend_image)[0]
}

# One public subnet and an internet gateway. There is deliberately no NAT gateway,
# private subnet, load balancer, RDS instance, or multi-AZ deployment.
resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true
}

resource "aws_subnet" "public" {
  vpc_id                  = aws_vpc.main.id
  cidr_block              = "10.0.1.0/24"
  availability_zone       = var.availability_zone
  map_public_ip_on_launch = true
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }
}

resource "aws_route_table_association" "public" {
  subnet_id      = aws_subnet.public.id
  route_table_id = aws_route_table.public.id
}

resource "aws_security_group" "api" {
  name   = "${local.name}-api"
  vpc_id = aws_vpc.main.id

  ingress {
    description = "Public FastAPI port"
    protocol    = "tcp"
    from_port   = 8000
    to_port     = 8000
    cidr_blocks = ["0.0.0.0/0"]
  }

  dynamic "ingress" {
    for_each = var.ssh_cidr == "" ? [] : [var.ssh_cidr]
    content {
      description = "Optional SSH administration"
      protocol    = "tcp"
      from_port   = 22
      to_port     = 22
      cidr_blocks = [ingress.value]
    }
  }

  egress {
    protocol    = "-1"
    from_port   = 0
    to_port     = 0
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_s3_bucket" "media" {
  bucket = "${local.name}-${data.aws_caller_identity.current.account_id}-media"
}

resource "aws_s3_bucket_public_access_block" "media" {
  bucket                  = aws_s3_bucket.media.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket" "web" {
  bucket = local.web_bucket
}

resource "aws_s3_bucket_website_configuration" "web" {
  bucket = aws_s3_bucket.web.id

  index_document {
    suffix = "index.html"
  }

  error_document {
    key = "index.html"
  }
}

resource "aws_s3_bucket_public_access_block" "web" {
  bucket                  = aws_s3_bucket.web.id
  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}

resource "aws_s3_bucket_policy" "web" {
  bucket = aws_s3_bucket.web.id
  depends_on = [aws_s3_bucket_public_access_block.web]
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = "*"
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.web.arn}/*"
    }]
  })
}

resource "aws_dynamodb_table" "main" {
  name         = "${local.name}-data"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "PK"
  range_key    = "SK"

  attribute {
    name = "PK"
    type = "S"
  }

  attribute {
    name = "SK"
    type = "S"
  }

  dynamic "attribute" {
    for_each = toset([
      "gsi_handle_pk", "gsi_handle_sk", "gsi_slug_pk", "gsi_slug_sk",
      "gsi_content_pk", "gsi_content_sk", "gsi_user_society_pk", "gsi_user_society_sk",
      "gsi_mod_pk", "gsi_mod_sk", "gsi_report_pk", "gsi_report_sk",
      "gsi_appeal_pk", "gsi_appeal_sk", "gsi_society_pin_pk", "gsi_society_pin_sk"
    ])
    content {
      name = attribute.value
      type = "S"
    }
  }

  dynamic "global_secondary_index" {
    for_each = {
      handle       = ["gsi_handle", "gsi_handle_pk", "gsi_handle_sk"]
      slug         = ["gsi_slug", "gsi_slug_pk", "gsi_slug_sk"]
      content      = ["gsi_content", "gsi_content_pk", "gsi_content_sk"]
      user_society = ["gsi_user_society", "gsi_user_society_pk", "gsi_user_society_sk"]
      modqueue     = ["gsi_modqueue", "gsi_mod_pk", "gsi_mod_sk"]
      report       = ["gsi_report", "gsi_report_pk", "gsi_report_sk"]
      appeal       = ["gsi_appeal", "gsi_appeal_pk", "gsi_appeal_sk"]
      society_pin  = ["gsi_society_pin", "gsi_society_pin_pk", "gsi_society_pin_sk"]
    }
    content {
      name            = global_secondary_index.value[0]
      hash_key        = global_secondary_index.value[1]
      range_key       = global_secondary_index.value[2]
      projection_type = "ALL"
    }
  }
}

resource "aws_sqs_queue" "moderation" { name = "${local.name}-moderation" }
resource "aws_sqs_queue" "image"      { name = "${local.name}-image" }
resource "aws_sqs_queue" "events"     { name = "${local.name}-events" }

resource "aws_cognito_user_pool" "main" {
  name                = local.name
  username_attributes = ["email"]

  auto_verified_attributes = ["email"]

  password_policy {
    minimum_length    = 8
    require_lowercase = false
    require_numbers   = false
    require_symbols   = false
    require_uppercase = false
  }
}

resource "aws_cognito_user_pool_client" "web" {
  name         = "${local.name}-web"
  user_pool_id = aws_cognito_user_pool.main.id
}

resource "aws_ecr_repository" "backend" {
  name                 = local.name
  image_tag_mutability = "MUTABLE"
}

resource "aws_iam_role" "ec2" {
  name = "${local.name}-ec2"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "ec2" {
  role = aws_iam_role.ec2.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["dynamodb:*"]
        Resource = [aws_dynamodb_table.main.arn, "${aws_dynamodb_table.main.arn}/index/*"]
      },
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket"]
        Resource = [aws_s3_bucket.media.arn, "${aws_s3_bucket.media.arn}/*"]
      },
      {
        Effect   = "Allow"
        Action   = ["sqs:SendMessage", "sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes"]
        Resource = [aws_sqs_queue.moderation.arn, aws_sqs_queue.image.arn, aws_sqs_queue.events.arn]
      },
      {
        Effect   = "Allow"
        Action   = ["ecr:GetAuthorizationToken"]
        Resource = "*"
      },
      {
        Effect   = "Allow"
        Action   = ["ecr:BatchCheckLayerAvailability", "ecr:GetDownloadUrlForLayer", "ecr:BatchGetImage"]
        Resource = aws_ecr_repository.backend.arn
      }
    ]
  })
}

resource "aws_iam_instance_profile" "ec2" {
  name = "${local.name}-ec2"
  role = aws_iam_role.ec2.name
}

resource "aws_instance" "api" {
  ami                         = data.aws_ami.amazon_linux.id
  instance_type               = var.instance_type
  subnet_id                   = aws_subnet.public.id
  vpc_security_group_ids      = [aws_security_group.api.id]
  associate_public_ip_address = true
  iam_instance_profile        = aws_iam_instance_profile.ec2.name

  user_data = templatefile("${path.module}/user-data.sh.tftpl", {
    image       = var.backend_image
    registry    = local.image_registry
    region      = var.aws_region
    environment = var.stage
    api_env     = local.api_env
  })
}
