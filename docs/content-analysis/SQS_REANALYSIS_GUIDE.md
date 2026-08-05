# Queued Thread Re-analysis

Moderator re-analysis uses the existing low-cost ECS/EC2 deployment without
making the HTTP request wait for Lambda:

```text
Admin UI
  -> POST /api/v1/{admin|mod}/.../reanalyze
  -> authorization + thread existence check
  -> content-analysis-reanalysis SQS queue
  -> ReanalysisWorker in the existing ECS backend task
  -> ContentAnalysisService.reanalyzeThread
  -> Lambda RequestResponse invocation
  -> persisted analysis run
```

The API returns `202 {"status":"queued"}` after SQS accepts the message. The
message contains only the thread ID and a versioned job envelope; the worker
rehydrates thread content from PostgreSQL and S3 through the existing analysis
context adapter.

## Reliability

- The queue has a 120-second visibility timeout, above the configured 55-second
  Lambda timeout.
- The worker acknowledges a valid job only after the analysis service settles
  its run. Lambda failures are persisted as failed runs and are acknowledged;
  transport/database failures remain visible for SQS retry and the DLQ.
- The queue is separate from `thread-events`, whose contract is reserved for
  audit consumers.
- The worker runs inside the existing ECS backend task. No extra ECS service,
  Lambda event-source mapping, NAT Gateway, or IAM role is added.

## Configuration

OpenTofu provisions the queue, DLQ, shared `LabRole` resource policy, backend
environment variable, and outputs:

- `CONTENT_ANALYSIS_QUEUE_URL`
- `content_analysis_reanalysis_queue_url`
- `content_analysis_reanalysis_dlq_url`

For local development, the queue is optional. When content analysis is enabled
without a queue, re-analysis endpoints return `ANALYSIS_UNAVAILABLE`; deployed
production content-analysis configuration includes the Terraform-provided URL.

## Verification

After applying infrastructure and deploying the backend, click **Re-analyze**
and verify `202` in the browser network panel. Then inspect ECS CloudWatch logs
for the enqueue, worker completion, and Lambda invocation, and query the latest
`content_analysis_runs` row for the thread. Queue depth and DLQ state can be
checked with:

```sh
aws sqs get-queue-attributes \
  --queue-url "$(tofu output -raw content_analysis_reanalysis_queue_url)" \
  --attribute-names ApproximateNumberOfMessages ApproximateNumberOfMessagesNotVisible
```
