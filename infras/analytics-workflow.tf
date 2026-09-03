# ---------------------------------------------------------------------------
# Managed analytics refresh workflow.
#
# The ECS API creates a durable refresh row and starts this Standard Step
# Functions workflow. Step Functions waits for Glue and Athena using AWS-native
# integrations; ECS no longer runs a periodic analytics reconciler.
# ---------------------------------------------------------------------------

variable "analytics_workflow_zip_path" {
  description = "Path to the bundled analytics workflow Lambda zip."
  type        = string
  default     = "../backend/dist-function/analytics-workflow.zip"
}

resource "aws_security_group" "analytics_workflow" {
  count = var.enable_analytics_pipeline ? 1 : 0

  name_prefix = "${local.name}-analytics-workflow-"
  description = "Analytics workflow Lambda access to RDS and AWS interface endpoints"
  vpc_id      = aws_vpc.this.id

  egress {
    description = "AWS service API and PostgreSQL access"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.common_tags, { Name = "${local.name}-analytics-workflow" })
}


resource "aws_security_group_rule" "analytics_workflow_endpoint_ingress" {
  count = var.enable_analytics_pipeline ? 1 : 0

  type                     = "ingress"
  description              = "Analytics workflow Lambda HTTPS to interface endpoints"
  from_port                = 443
  to_port                  = 443
  protocol                 = "tcp"
  security_group_id        = aws_security_group.analytics_workflow_endpoints[0].id
  source_security_group_id = aws_security_group.analytics_workflow[0].id
}

resource "aws_security_group_rule" "ecs_analytics_endpoint_ingress" {
  count = var.enable_analytics_pipeline ? 1 : 0

  type                     = "ingress"
  description              = "ECS secret injection and log delivery to analytics interface endpoints"
  from_port                = 443
  to_port                  = 443
  protocol                 = "tcp"
  security_group_id        = aws_security_group.analytics_workflow_endpoints[0].id
  source_security_group_id = aws_security_group.ecs.id
}

resource "aws_security_group" "analytics_workflow_endpoints" {
  count = var.enable_analytics_pipeline ? 1 : 0

  name_prefix = "${local.name}-analytics-endpoints-"
  description = "Interface endpoint ingress for analytics workflow Lambda"
  vpc_id      = aws_vpc.this.id

  egress {
    description = "Endpoint response traffic"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.common_tags, { Name = "${local.name}-analytics-endpoints" })
}

resource "aws_vpc_endpoint" "analytics_workflow_athena" {
  count = var.enable_analytics_pipeline ? 1 : 0

  vpc_id              = aws_vpc.this.id
  service_name        = "com.amazonaws.${var.aws_region}.athena"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = aws_subnet.database[*].id
  security_group_ids  = [aws_security_group.analytics_workflow_endpoints[0].id]
  private_dns_enabled = true

  tags = merge(local.common_tags, { Name = "${local.name}-analytics-athena-endpoint" })
}

resource "aws_vpc_endpoint" "analytics_workflow_secretsmanager" {
  count = var.enable_analytics_pipeline ? 1 : 0

  vpc_id              = aws_vpc.this.id
  service_name        = "com.amazonaws.${var.aws_region}.secretsmanager"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = aws_subnet.database[*].id
  security_group_ids  = [aws_security_group.analytics_workflow_endpoints[0].id]
  private_dns_enabled = true

  tags = merge(local.common_tags, { Name = "${local.name}-analytics-secrets-endpoint" })
}

resource "aws_vpc_endpoint" "analytics_workflow_logs" {
  count = var.enable_analytics_pipeline ? 1 : 0

  vpc_id              = aws_vpc.this.id
  service_name        = "com.amazonaws.${var.aws_region}.logs"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = aws_subnet.database[*].id
  security_group_ids  = [aws_security_group.analytics_workflow_endpoints[0].id]
  private_dns_enabled = true

  tags = merge(local.common_tags, { Name = "${local.name}-analytics-logs-endpoint" })
}

resource "aws_cloudwatch_log_group" "analytics_workflow" {
  count = var.enable_analytics_pipeline ? 1 : 0

  name              = "/aws/lambda/${local.name}-analytics-workflow"
  retention_in_days = var.log_retention_days
  tags              = local.common_tags
}

resource "aws_lambda_function" "analytics_workflow" {
  count = var.enable_analytics_pipeline ? 1 : 0

  function_name    = "${local.name}-analytics-workflow"
  role             = data.aws_iam_role.learner_lab.arn
  handler          = "index.handler"
  runtime          = "nodejs22.x"
  filename         = var.analytics_workflow_zip_path
  source_code_hash = filebase64sha256(var.analytics_workflow_zip_path)
  publish          = true

  architectures                  = ["x86_64"]
  memory_size                    = 512
  timeout                        = 180
  reserved_concurrent_executions = 1

  vpc_config {
    subnet_ids         = aws_subnet.database[*].id
    security_group_ids = [aws_security_group.analytics_workflow[0].id]
  }

  environment {
    variables = {
      DATABASE_URL_SECRET_ARN            = aws_secretsmanager_secret.database_url.arn
      RDS_CA_BUNDLE_PATH                 = "/var/task/rds-global-bundle.pem"
      ANALYTICS_RAW_EVENT_RETENTION_DAYS = tostring(var.analytics_raw_event_retention_days)
    }
  }

  logging_config {
    log_format = "Text"
    log_group  = aws_cloudwatch_log_group.analytics_workflow[0].name
  }

  tags = local.common_tags
}

locals {
  analytics_refresh_definition = {
    Comment        = "RDS snapshot, Athena metrics, and durable analytics persistence"
    StartAt        = "MarkExporting"
    TimeoutSeconds = 2700
    States = {
      MarkExporting = {
        Type     = "Task"
        Resource = aws_lambda_function.analytics_workflow[0].arn
        Parameters = {
          action    = "mark"
          "runId.$" = "$.runId"
          status    = "exporting"
        }
        ResultPath = "$.marked"
        Retry = [{
          ErrorEquals     = ["Lambda.ServiceException", "Lambda.AWSLambdaException", "Lambda.SdkClientException"]
          IntervalSeconds = 2
          MaxAttempts     = 2
          BackoffRate     = 2
        }]
        Catch = [{ ErrorEquals = ["States.ALL"], ResultPath = "$.error", Next = "MarkFailed" }]
        Next  = "ExportGlue"
      }
      ExportGlue = {
        Type     = "Task"
        Resource = "arn:aws:states:::glue:startJobRun.sync"
        Parameters = {
          JobName = local.analytics_glue_job_name
          Arguments = {
            "--refresh-run-id.$" = "$.runId"
            "--snapshot-at.$"    = "$.snapshotAt"
            "--period-start.$"   = "$.periodStart"
            "--period-end.$"     = "$.periodEnd"
          }
        }
        ResultPath = "$.glue"
        Catch      = [{ ErrorEquals = ["States.ALL"], ResultPath = "$.error", Next = "MarkFailed" }]
        Next       = "PrepareQueries"
      }
      PrepareQueries = {
        Type     = "Task"
        Resource = aws_lambda_function.analytics_workflow[0].arn
        Parameters = {
          action           = "prepare"
          "runId.$"        = "$.runId"
          "glueJobRunId.$" = "$.glue.Id"
        }
        ResultPath = "$.prepared"
        Retry = [{
          ErrorEquals     = ["Lambda.ServiceException", "Lambda.AWSLambdaException", "Lambda.SdkClientException"]
          IntervalSeconds = 2
          MaxAttempts     = 2
          BackoffRate     = 2
        }]
        Catch = [{ ErrorEquals = ["States.ALL"], ResultPath = "$.error", Next = "MarkFailed" }]
        Next  = "RunAthenaQueries"
      }
      RunAthenaQueries = {
        Type           = "Map"
        ItemsPath      = "$.prepared.queries"
        MaxConcurrency = 4
        ItemSelector = {
          "metricType.$" = "$$.Map.Item.Value.metricType"
          "sql.$"        = "$$.Map.Item.Value.sql"
        }
        ItemProcessor = {
          ProcessorConfig = { Mode = "INLINE" }
          StartAt         = "QueryAthena"
          States = {
            QueryAthena = {
              Type     = "Task"
              Resource = "arn:aws:states:::athena:startQueryExecution.sync"
              Parameters = {
                "QueryString.$" = "$.sql"
                QueryExecutionContext = {
                  Catalog  = "AwsDataCatalog"
                  Database = local.analytics_catalog_database
                }
                WorkGroup = aws_athena_workgroup.analytics[0].name
                ResultConfiguration = {
                  OutputLocation = "s3://${aws_s3_bucket.analytics[0].id}/analytics/query-results/"
                }
                "ClientRequestToken.$" = "States.Format('{}:{}', $$.Execution.Input.runId, $.metricType)"
              }
              ResultSelector = {
                "queryExecutionId.$" = "$.QueryExecution.QueryExecutionId"
              }
              ResultPath = "$.athena"
              Next       = "ShapeQueryResult"
            }
            ShapeQueryResult = {
              Type = "Pass"
              Parameters = {
                "metricType.$"       = "$.metricType"
                "queryExecutionId.$" = "$.athena.queryExecutionId"
              }
              End = true
            }
          }
        }
        ResultPath = "$.queryResults"
        Catch      = [{ ErrorEquals = ["States.ALL"], ResultPath = "$.error", Next = "MarkFailed" }]
        Next       = "PersistMetrics"
      }
      PersistMetrics = {
        Type     = "Task"
        Resource = aws_lambda_function.analytics_workflow[0].arn
        Parameters = {
          action                = "persist"
          "runId.$"             = "$.runId"
          "queryExecutionIds.$" = "$.queryResults"
        }
        Retry = [{
          ErrorEquals     = ["Lambda.ServiceException", "Lambda.AWSLambdaException", "Lambda.SdkClientException"]
          IntervalSeconds = 2
          MaxAttempts     = 2
          BackoffRate     = 2
        }]
        Catch = [{ ErrorEquals = ["States.ALL"], ResultPath = "$.error", Next = "MarkFailed" }]
        End   = true
      }
      MarkFailed = {
        Type     = "Task"
        Resource = aws_lambda_function.analytics_workflow[0].arn
        Parameters = {
          action        = "mark"
          "runId.$"     = "$.runId"
          status        = "failed"
          "lastError.$" = "$.error.Cause"
        }
        Retry = [{
          ErrorEquals     = ["States.ALL"]
          IntervalSeconds = 5
          MaxAttempts     = 5
          BackoffRate     = 2
        }]
        TimeoutSeconds = 60
        End            = true
      }
    }
  }
}
locals {
  analytics_refresh_state_machine_arn = var.enable_analytics_pipeline ? try(aws_sfn_state_machine.analytics_refresh[0].arn, "") : ""
}

resource "aws_sfn_state_machine" "analytics_refresh" {
  count = var.enable_analytics_pipeline ? 1 : 0

  name       = "${local.name}-analytics-refresh"
  role_arn   = data.aws_iam_role.learner_lab.arn
  definition = jsonencode(local.analytics_refresh_definition)
  type       = "STANDARD"

  tags = local.common_tags
}

resource "aws_lambda_permission" "analytics_workflow_step_functions" {
  count = var.enable_analytics_pipeline ? 1 : 0

  statement_id  = "AllowAnalyticsStepFunctions"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.analytics_workflow[0].function_name
  principal     = "states.amazonaws.com"
  source_arn    = aws_sfn_state_machine.analytics_refresh[0].arn
}

output "analytics_refresh_state_machine_arn" {
  value = try(aws_sfn_state_machine.analytics_refresh[0].arn, null)
}

output "analytics_workflow_function_name" {
  value = try(aws_lambda_function.analytics_workflow[0].function_name, null)
}
