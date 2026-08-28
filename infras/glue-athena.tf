# ---------------------------------------------------------------------------
# Glue + Athena analytics data plane.
#
# Glue materializes a consistent PostgreSQL snapshot and Athena queries the
# cataloged Parquet data. Both are started and reconciled by the ECS backend.
# ---------------------------------------------------------------------------

variable "analytics_glue_script_path" {
  description = "Path to the Glue Spark export script."
  type        = string
  default     = "../backend/src/functions/analytics/glue/export_rds.py"
}

locals {
  analytics_catalog_database = "analytics"
  analytics_catalog_tables = {
    users = {
      columns = [
        { name = "id", type = "string" },
        { name = "created_at", type = "timestamp" },
        { name = "status", type = "string" },
      ]
    }
    societies = {
      columns = [
        { name = "id", type = "string" },
        { name = "name", type = "string" },
        { name = "slug", type = "string" },
        { name = "status", type = "string" },
        { name = "created_at", type = "timestamp" },
      ]
    }
    threads = {
      columns = [
        { name = "id", type = "string" },
        { name = "society_id", type = "string" },
        { name = "author_id", type = "string" },
        { name = "status", type = "string" },
        { name = "created_at", type = "timestamp" },
      ]
    }
    comments = {
      columns = [
        { name = "id", type = "string" },
        { name = "thread_id", type = "string" },
        { name = "author_id", type = "string" },
        { name = "status", type = "string" },
        { name = "created_at", type = "timestamp" },
        { name = "society_id", type = "string" },
      ]
    }
    memberships = {
      columns = [
        { name = "society_id", type = "string" },
        { name = "user_id", type = "string" },
        { name = "role", type = "string" },
        { name = "status", type = "string" },
        { name = "joined_at", type = "timestamp" },
      ]
    }
    votes = {
      columns = [
        { name = "target_id", type = "string" },
        { name = "user_id", type = "string" },
        { name = "value", type = "bigint" },
        { name = "created_at", type = "timestamp" },
        { name = "society_id", type = "string" },
      ]
    }
    reports = {
      columns = [
        { name = "id", type = "string" },
        { name = "society_id", type = "string" },
        { name = "status", type = "string" },
        { name = "created_at", type = "timestamp" },
        { name = "resolved_at", type = "timestamp" },
      ]
    }
  }
  analytics_glue_job_name = var.analytics_glue_job_name != "" ? var.analytics_glue_job_name : "${local.name}-analytics-export"
}

resource "aws_security_group" "analytics_glue" {
  count = var.enable_analytics_pipeline ? 1 : 0

  name_prefix = "${local.name}-analytics-glue-"
  description = "Glue analytics export access to PostgreSQL"
  vpc_id      = aws_vpc.this.id

  egress {
    description = "Glue service and database egress"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.common_tags, { Name = "${local.name}-analytics-glue" })
}

resource "aws_security_group_rule" "analytics_glue_self" {
  count = var.enable_analytics_pipeline ? 1 : 0

  type                     = "ingress"
  from_port                = 0
  to_port                  = 65535
  protocol                 = "tcp"
  security_group_id        = aws_security_group.analytics_glue[0].id
  source_security_group_id = aws_security_group.analytics_glue[0].id
  description              = "Glue worker communication within the security group"
}

resource "aws_security_group_rule" "analytics_glue_to_database" {
  count = var.enable_analytics_pipeline ? 1 : 0

  type                     = "ingress"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  security_group_id        = aws_security_group.database.id
  source_security_group_id = aws_security_group.analytics_glue[0].id
  description              = "Glue analytics export PostgreSQL access"
}

resource "aws_route_table" "analytics_private" {
  count  = var.enable_analytics_pipeline ? 1 : 0
  vpc_id = aws_vpc.this.id

  tags = merge(local.common_tags, { Name = "${local.name}-analytics-private" })
}

resource "aws_route_table_association" "analytics_private" {
  count = var.enable_analytics_pipeline ? 2 : 0

  subnet_id      = aws_subnet.database[count.index].id
  route_table_id = aws_route_table.analytics_private[0].id
}

resource "aws_vpc_endpoint" "analytics_s3" {
  count = var.enable_analytics_pipeline ? 1 : 0

  vpc_id            = aws_vpc.this.id
  service_name      = "com.amazonaws.${var.aws_region}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = [aws_route_table.analytics_private[0].id]

  tags = merge(local.common_tags, { Name = "${local.name}-analytics-s3" })
}

resource "aws_glue_connection" "analytics" {
  count = var.enable_analytics_pipeline ? 1 : 0

  name = "${local.name}-analytics-rds"

  connection_properties = {
    JDBC_CONNECTION_URL = "jdbc:postgresql://${aws_db_instance.this.address}:${aws_db_instance.this.port}/${var.db_name}"
    USERNAME            = var.db_username
    PASSWORD            = random_password.database.result
  }

  physical_connection_requirements {
    availability_zone      = data.aws_availability_zones.available.names[0]
    subnet_id              = aws_subnet.database[0].id
    security_group_id_list = [aws_security_group.analytics_glue[0].id]
  }

  tags = local.common_tags
}

resource "aws_s3_object" "analytics_glue_script" {
  count = var.enable_analytics_pipeline ? 1 : 0

  bucket = aws_s3_bucket.analytics[0].id
  key    = "analytics/glue/export_rds.py"
  source = var.analytics_glue_script_path
  etag   = filemd5(var.analytics_glue_script_path)
  tags   = local.common_tags
}

resource "aws_glue_catalog_database" "analytics" {
  count = var.enable_analytics_pipeline ? 1 : 0

  name = local.analytics_catalog_database
}

resource "aws_glue_catalog_table" "analytics" {
  for_each = var.enable_analytics_pipeline ? local.analytics_catalog_tables : {}

  name          = each.key
  database_name = aws_glue_catalog_database.analytics[0].name
  table_type    = "EXTERNAL_TABLE"

  storage_descriptor {
    location      = "s3://${aws_s3_bucket.analytics[0].id}/analytics/source/table=${each.key}/"
    input_format  = "org.apache.hadoop.hive.ql.io.parquet.MapredParquetInputFormat"
    output_format = "org.apache.hadoop.hive.ql.io.parquet.MapredParquetOutputFormat"

    ser_de_info {
      name                  = "${each.key}-parquet"
      serialization_library = "org.apache.hadoop.hive.ql.io.parquet.serde.ParquetHiveSerDe"
    }

    dynamic "columns" {
      for_each = each.value.columns
      content {
        name = columns.value.name
        type = columns.value.type
      }
    }
  }

  partition_keys {
    name = "snapshot_at"
    type = "string"
  }

  partition_keys {
    name = "snapshot_id"
    type = "string"
  }

  parameters = {
    classification = "parquet"
  }
}

resource "aws_glue_catalog_table" "analytics_snapshot_manifest" {
  count = var.enable_analytics_pipeline ? 1 : 0

  name          = "snapshot_manifest"
  database_name = aws_glue_catalog_database.analytics[0].name
  table_type    = "EXTERNAL_TABLE"

  storage_descriptor {
    location      = "s3://${aws_s3_bucket.analytics[0].id}/analytics/manifest/"
    input_format  = "org.apache.hadoop.hive.ql.io.parquet.MapredParquetInputFormat"
    output_format = "org.apache.hadoop.hive.ql.io.parquet.MapredParquetOutputFormat"

    ser_de_info {
      name                  = "snapshot-manifest-parquet"
      serialization_library = "org.apache.hadoop.hive.ql.io.parquet.serde.ParquetHiveSerDe"
    }

    columns {
      name = "snapshot_at"
      type = "string"
    }
    columns {
      name = "snapshot_id"
      type = "string"
    }
    columns {
      name = "completed_at"
      type = "timestamp"
    }
  }

  parameters = {
    classification = "parquet"
  }
}

resource "aws_athena_workgroup" "analytics" {
  count = var.enable_analytics_pipeline ? 1 : 0

  name = "${local.name}-analytics"

  configuration {
    enforce_workgroup_configuration    = true
    publish_cloudwatch_metrics_enabled = false
    result_configuration {
      output_location = "s3://${aws_s3_bucket.analytics[0].id}/analytics/query-results/"
    }
  }

  force_destroy = true
  tags          = local.common_tags
}

resource "aws_s3_bucket_lifecycle_configuration" "analytics_retention" {
  count  = var.enable_analytics_pipeline ? 1 : 0
  bucket = aws_s3_bucket.analytics[0].id

  rule {
    id     = "expire-analytics-snapshots"
    status = "Enabled"
    filter { prefix = "analytics/source/" }
    expiration { days = 30 }
  }

  rule {
    id     = "expire-analytics-manifest"
    status = "Enabled"
    filter { prefix = "analytics/manifest/" }
    expiration { days = 30 }
  }

  rule {
    id     = "expire-athena-results"
    status = "Enabled"
    filter { prefix = "analytics/query-results/" }
    expiration { days = 7 }
  }

  rule {
    id     = "expire-glue-temp"
    status = "Enabled"
    filter { prefix = "analytics/glue-temp/" }
    expiration { days = 1 }
  }
}

resource "aws_glue_job" "analytics_export" {
  count = var.enable_analytics_pipeline ? 1 : 0

  name              = local.analytics_glue_job_name
  role_arn          = data.aws_iam_role.learner_lab.arn
  glue_version      = "4.0"
  worker_type       = "G.1X"
  number_of_workers = 2
  max_retries       = 0
  timeout           = 30

  execution_property {
    max_concurrent_runs = 1
  }

  command {
    name            = "glueetl"
    script_location = "s3://${aws_s3_bucket.analytics[0].id}/${aws_s3_object.analytics_glue_script[0].key}"
    python_version  = "3"
  }

  connections = [aws_glue_connection.analytics[0].name]

  default_arguments = {
    "--job-language"     = "python"
    "--analytics-bucket" = aws_s3_bucket.analytics[0].id
    "--catalog-database" = local.analytics_catalog_database
    "--connection-name"  = aws_glue_connection.analytics[0].name
    "--TempDir"          = "s3://${aws_s3_bucket.analytics[0].id}/analytics/glue-temp/"
  }

  tags = local.common_tags
}

output "analytics_glue_job_name" {
  value = try(aws_glue_job.analytics_export[0].name, null)
}

output "analytics_athena_workgroup" {
  value = try(aws_athena_workgroup.analytics[0].name, null)
}
