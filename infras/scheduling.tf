# ---------------------------------------------------------------------------
# Analytics refresh scheduling (Lambda-free orchestration, ticket #11)
#
# Nightly and on-demand analytics refreshes are orchestrated by the ECS
# backend (decision #10): EventBridge Scheduler fires an API destination
# (API-key connection) that POSTs to the backend's internal scheduled-refresh
# route. The backend starts the Glue export, polls it with an in-process
# reconciler, runs the Athena metric queries, and upserts results into RDS.
# No analytics Lambda is involved anywhere in this flow.
#
# GATE (Academy Learner Lab):
#   - Confirm EventBridge Scheduler + API destinations are available in the
#     active lab (Associate Services) in us-east-1.
#   - aws_scheduler_schedule assumes role_arn; LabRole must be permitted to
#     call events:InvokeApiDestination on the destination ARN. The lab-managed
#     LabRole policy usually grants events:* — verify in the console before
#     applying. If not permitted, the documented fallback is an EventBridge-
#     targeted one-off ECS worker task (see ticket #11 comment).
#   - No IAM roles/users are created here; everything reuses data.aws_iam_role.learner_lab.
#
# Teardown: `tofu destroy` removes schedule + destination + connection;
# the random secret has no cost.
# ---------------------------------------------------------------------------

variable "analytics_glue_job_name" {
  description = "Name of the Glue job that exports RDS data to S3 for Athena (defined alongside the analytics pipeline resources). Empty string disables analytics orchestration env wiring."
  type        = string
  default     = ""
}

variable "analytics_refresh_schedule_expression" {
  description = "EventBridge Scheduler expression for the nightly analytics refresh."
  type        = string
  default     = "cron(0 2 * * ? *)"
}

variable "analytics_refresh_reconcile_interval_ms" {
  description = "Backend reconciler sweep interval for in-flight analytics refresh runs."
  type        = number
  default     = 60000
}

variable "analytics_refresh_max_phase_retries" {
  description = "Per-phase retry cap inside the backend orchestrator before a run fails."
  type        = number
  default     = 3
}

variable "analytics_refresh_stale_after_ms" {
  description = "How long a refresh run may stay untouched before the reconciler fails it as stale."
  type        = number
  default     = 2700000
}

resource "terraform_data" "analytics_scheduler_permissions" {
  count = var.enable_analytics_pipeline ? 1 : 0

  input = var.analytics_scheduler_permissions_confirmed

  lifecycle {
    precondition {
      condition = var.analytics_scheduler_permissions_confirmed && strcontains(
        data.aws_iam_role.learner_lab.assume_role_policy,
        "scheduler.amazonaws.com",
      )
      error_message = "Analytics scheduling is disabled: verify the active LabRole trust includes scheduler.amazonaws.com and its permissions include events:InvokeApiDestination and sqs:SendMessage, then set analytics_scheduler_permissions_confirmed=true."
    }
  }
}

resource "random_password" "analytics_scheduler_secret" {
  count   = var.enable_analytics_pipeline ? 1 : 0
  length  = 40
  special = false
}

resource "aws_secretsmanager_secret" "analytics_scheduler_secret" {
  count       = var.enable_analytics_pipeline ? 1 : 0
  name_prefix = "${local.name}-analytics-scheduler-"
  description = "Shared secret for the internal analytics scheduler API destination"
  tags        = local.common_tags
}

resource "aws_secretsmanager_secret_version" "analytics_scheduler_secret" {
  count         = var.enable_analytics_pipeline ? 1 : 0
  secret_id     = aws_secretsmanager_secret.analytics_scheduler_secret[0].id
  secret_string = random_password.analytics_scheduler_secret[0].result
}

resource "aws_cloudwatch_event_connection" "analytics_scheduler" {
  count = var.enable_analytics_pipeline ? 1 : 0

  name               = "${local.name}-analytics-scheduler"
  description        = "API-key connection used by the nightly analytics refresh API destination"
  authorization_type = "API_KEY"

  auth_parameters {
    api_key {
      key   = "x-analytics-scheduler-secret"
      value = random_password.analytics_scheduler_secret[0].result
    }
  }

}

resource "aws_cloudwatch_event_api_destination" "analytics_scheduled_refresh" {
  count = var.enable_analytics_pipeline ? 1 : 0

  name                = "${local.name}-analytics-scheduled-refresh"
  description         = "Points the nightly scheduler at the backend internal scheduled-refresh route"
  invocation_endpoint = "${local.api_origin}/api/v1/admin/analytics/scheduled-refresh"
  http_method         = "POST"
  connection_arn      = aws_cloudwatch_event_connection.analytics_scheduler[0].arn

}

resource "aws_scheduler_schedule" "analytics_nightly_refresh" {
  count = var.enable_analytics_pipeline ? 1 : 0

  name       = "${local.name}-analytics-nightly-refresh"
  group_name = "default"

  flexible_time_window {
    mode = "OFF"
  }

  schedule_expression          = var.analytics_refresh_schedule_expression
  schedule_expression_timezone = "UTC"

  target {
    arn      = aws_cloudwatch_event_api_destination.analytics_scheduled_refresh[0].arn
    role_arn = data.aws_iam_role.learner_lab.arn

    input = jsonencode({})

    dead_letter_config {
      arn = aws_sqs_queue.analytics_scheduler_dlq[0].arn
    }

    retry_policy {
      maximum_retry_attempts       = 3
      maximum_event_age_in_seconds = 3600
    }
  }

}
