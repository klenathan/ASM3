resource "aws_sqs_queue" "thread_events" {
  name                       = "${local.name}-thread-events"
  visibility_timeout_seconds = 60
  message_retention_seconds  = 1209600
  receive_wait_time_seconds  = 20
  sqs_managed_sse_enabled    = true
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.thread_events_dlq.arn
    maxReceiveCount     = 5
  })
  tags = local.common_tags
}

resource "aws_sqs_queue" "thread_events_dlq" {
  name                      = "${local.name}-thread-events-dlq"
  message_retention_seconds = 1209600
  sqs_managed_sse_enabled   = true
  tags                      = local.common_tags
}

resource "aws_sqs_queue" "content_analysis_reanalysis" {
  name                       = "${local.name}-content-analysis-reanalysis"
  visibility_timeout_seconds = 120
  message_retention_seconds  = 1209600
  receive_wait_time_seconds  = 20
  sqs_managed_sse_enabled    = true
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.content_analysis_reanalysis_dlq.arn
    maxReceiveCount     = 5
  })
  tags = local.common_tags
}

resource "aws_sqs_queue" "content_analysis_reanalysis_dlq" {
  name                      = "${local.name}-content-analysis-reanalysis-dlq"
  message_retention_seconds = 1209600
  sqs_managed_sse_enabled   = true
  tags                      = local.common_tags
}

# Learner Lab users cannot modify the pre-provisioned LabRole. Grant the ECS
# task role access through the queue resource policy instead of iam:PutRolePolicy.
data "aws_iam_policy_document" "thread_events_queue" {
  statement {
    effect = "Allow"
    actions = [
      "sqs:SendMessage",
      "sqs:ReceiveMessage",
      "sqs:DeleteMessage",
      "sqs:ChangeMessageVisibility",
      "sqs:GetQueueAttributes",
    ]
    resources = [aws_sqs_queue.thread_events.arn]

    principals {
      type        = "AWS"
      identifiers = [data.aws_iam_role.learner_lab.arn]
    }
  }
}

resource "aws_sqs_queue_policy" "thread_events" {
  queue_url = aws_sqs_queue.thread_events.url
  policy    = data.aws_iam_policy_document.thread_events_queue.json
}

data "aws_iam_policy_document" "content_analysis_reanalysis_queue" {
  statement {
    effect = "Allow"
    actions = [
      "sqs:SendMessage",
      "sqs:ReceiveMessage",
      "sqs:DeleteMessage",
      "sqs:ChangeMessageVisibility",
      "sqs:GetQueueAttributes",
    ]
    resources = [aws_sqs_queue.content_analysis_reanalysis.arn]

    principals {
      type        = "AWS"
      identifiers = [data.aws_iam_role.learner_lab.arn]
    }
  }
}

resource "aws_sqs_queue_policy" "content_analysis_reanalysis" {
  queue_url = aws_sqs_queue.content_analysis_reanalysis.url
  policy    = data.aws_iam_policy_document.content_analysis_reanalysis_queue.json
}
