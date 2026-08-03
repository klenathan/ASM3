# Lambda + Bedrock Content Analysis Plan

Status: proposed  
Scope: automated thread validation and report-context analysis  
AWS region: `us-east-1`

## 1. Objective

Use an on-demand AWS Lambda function and Amazon Bedrock to evaluate thread text and attached images. Analyze reported content with additional context from comments and vote aggregates. Preserve an auditable, asynchronous workflow through the existing `thread-events` Amazon SQS queue.

Lambda provides short-lived compute only when analysis is requested. A multimodal Bedrock foundation model performs text and image analysis. This avoids a managed agent runtime, dedicated worker, NAT Gateway, and paid VPC endpoints.

Sentiment is supporting information, not a validity rule. Negative criticism can be policy-compliant, while positive text can violate policy. Evaluate validity against global community policy and society rules.

## 2. Architecture decision

Visual companion: [Lambda + Bedrock content-analysis Excalidraw diagram](./LAMBDA_BEDROCK_CONTENT_ANALYSIS_ARCHITECTURE.excalidraw).

```text
Thread creation/update or report creation
  → PostgreSQL transaction
      → domain state + transactional outbox event
  → outbox relay
  → thread-events SQS + DLQ
  → existing backend ECS dispatcher
      → validate event and record immutable audit receipt
      → rehydrate authoritative context from RDS
      → invoke Lambda synchronously
          → retrieve approved private images from S3
          → invoke Bedrock Runtime multimodal model
          → return strict JSON
      → validate and persist analysis result in RDS
      → publish thread or route to moderator review
  → acknowledge SQS message after durable completion
```

### Why Lambda is invoked by the backend

The existing ECS backend already consumes `thread-events` and can reach private RDS. Keep database queries and business orchestration there. Lambda receives a bounded analysis request containing text context and S3 object references; it never connects to PostgreSQL.

Keep Lambda outside the VPC. It can call S3 and Bedrock through AWS service endpoints without adding a NAT Gateway or hourly-priced interface endpoints. A Lambda SQS event-source mapping is not the MVP default because direct event consumption would require either:

- private-RDS access from a VPC-attached function plus paid outbound networking; or
- extra snapshot and result queues to keep the function outside the VPC.

The backend invokes Lambda with `RequestResponse` and retains SQS-message ownership while the invocation runs. Increase or extend SQS visibility beyond the bounded Lambda timeout.

The target flow assumes private media access. Current `infras/storage.tf` permits public `s3:GetObject`; converting delivery to private/signed access is a separate security prerequisite. Lambda must use bucket/key references and AWS credentials even while that migration is pending.

### Cost model

- Existing ECS/EC2 and RDS remain baseline resources.
- Lambda incurs request and execution-duration cost only during analysis.
- Bedrock input/output and image inference is the main variable analysis cost.
- No managed agent runtime, dedicated ECS worker, NAT Gateway, or Bedrock VPC endpoint is added.
- Shadow rollout measures real invocation volume and token/image cost before enforcement.

Use one queue dispatcher because multiple consumers on one SQS queue compete for messages. Independent audit and analysis consumers would not each receive every event. Introduce SNS or EventBridge fan-out only when a confirmed independent-consumer requirement exists.

## 3. New-thread analysis flow

1. Validate membership, media ownership, and normal thread input.
2. Create the thread with status `pending_analysis`.
3. Write a versioned `thread.created` event to a transactional outbox in the same database transaction.
4. Publish the event to `thread-events` through the outbox relay.
5. The ECS dispatcher validates the event and writes an immutable integration audit record.
6. `ContentAnalysisService` rehydrates authoritative context:
   - thread title and body;
   - current global policy and society rules;
   - attached, ready image object references.
7. The backend invokes the analysis Lambda synchronously.
8. Lambda validates the request, retrieves approved images from private S3, invokes Bedrock Runtime, and returns strict JSON.
9. The backend validates and stores the result.
10. Apply the result transactionally:
    - `allow` → set thread to `published`;
    - `review` → set thread to `pending_review` and add it to moderation workflow;
    - exhausted failure or DLQ → set thread to `pending_review`, never silently publish.
11. Acknowledge the SQS message only after audit, analysis state, and thread transition are durable.

Any material edit to title, body, or media emits `thread.updated` and requires new analysis. MVP behavior hides the edited thread as `pending_analysis`; this avoids maintaining separate approved and pending content versions.

## 4. Report analysis flow

1. Create the user report and `report.created` outbox event atomically.
2. Publish the event to `thread-events` through the outbox relay.
3. Record the immutable integration audit receipt.
4. Capture an analysis snapshot containing:
   - report reason and optional details;
   - target thread title, body, and image references;
   - applicable society rules;
   - upvote count, downvote count, and net score;
   - total visible comment count;
   - latest 20 visible comments;
   - highest-scored 20 visible comments;
   - deduplicated comment IDs, bodies, and scores;
   - `contextTruncated` when not every comment is included.
5. Invoke Lambda with the bounded snapshot.
6. Lambda retrieves approved images, calls Bedrock, and returns the result.
7. Persist the validated result linked to the report.
8. Display it to authorized society moderators and system admins.

Do not send voter identities to Lambda or Bedrock. Engagement is context and must not determine policy compliance.

For a reported comment, include:

- reported comment;
- parent thread title and body;
- ancestor comment chain;
- nearby replies within a configured cap;
- comment and thread vote aggregates.

Report handling remains available while analysis is pending or failed. If analysis finishes after report resolution, retain it as audit evidence but do not change the moderator decision automatically.

## 5. Event contracts

Queue messages contain references, not thread bodies, comments, report details, image bytes, or presigned URLs. The backend rehydrates authoritative data by ID before invoking Lambda.

Example `report.created.v1` event:

```json
{
  "eventId": "uuid",
  "eventType": "report.created",
  "version": 1,
  "aggregateType": "report",
  "aggregateId": "uuid",
  "societyId": "uuid",
  "occurredAt": "ISO-8601"
}
```

Supported event types:

- `thread.created`;
- `thread.updated`;
- `report.created`;
- optionally `report.reanalysis_requested`.

Keep support for the existing `thread.created.v1` contract during migration. Introduce a minimal `thread.created.v2` contract without title or author data after every consumer supports the union schema.

SQS standard queues provide at-least-once delivery. Every handler must be idempotent by `eventId`.

## 6. Lambda request and response

### 6.1 Request

The backend sends structured JSON:

```ts
interface ContentAnalysisRequest {
  analysisId: string;
  triggerType: "thread_created" | "thread_updated" | "report_created" | "reanalysis";
  policyVersion: string;
  promptVersion: string;
  globalPolicy: string;
  societyRules: Array<{ id: string; title: string; description: string }>;
  content: {
    title?: string;
    body?: string;
    reportReason?: string;
    reportDetails?: string;
    comments: Array<{ id: string; body: string; score: number }>;
  };
  images: Array<{
    bucket: string;
    key: string;
    contentType: string;
    byteSize: number;
  }>;
  engagement: {
    upvotes: number;
    downvotes: number;
    netScore: number;
    visibleCommentCount: number;
    contextTruncated: boolean;
  };
  contextCapturedAt: string;
}
```

Requirements:

- keep the serialized invocation payload well below Lambda's synchronous payload limit;
- never include image bytes or presigned URLs in the invocation payload;
- allow only the configured media bucket, object prefix, MIME types, per-image size, image count, and total bytes;
- delimit title, body, report details, comments, and image-derived text as untrusted data;
- instruct the model to ignore instructions embedded in user content;
- omit author identity, reporter identity, voter identity, email, and unrelated profile data.

Lambda retrieves image bytes from S3, then supplies supported image blocks and text to the Bedrock Converse API. Reject objects whose actual metadata does not match the approved request.

### 6.2 Response

Require strict JSON and validate it with Zod in both Lambda and backend. Backend validation is authoritative before any state transition.

```ts
interface ContentAnalysisResult {
  decision: "allow" | "review";
  sentiment: {
    label: "positive" | "neutral" | "negative" | "mixed";
    confidence: number;
  };
  findings: Array<{
    category: string;
    severity: "low" | "medium" | "high";
    confidence: number;
    source: "title" | "body" | "image" | "comment";
    sourceId?: string;
    evidence: string;
  }>;
  summary: string;
}
```

Do not request or store chain-of-thought. Evidence contains only concise excerpts needed by moderators.

Persist:

- decision, sentiment, and structured findings;
- Bedrock model ID;
- Lambda function version or alias;
- policy and prompt versions;
- input hash and restricted snapshot/evidence;
- context-capture timestamp;
- Lambda request ID and Bedrock request ID when available;
- processing latency and sanitized failure code;
- creation, start, and completion timestamps.

## 7. Backend and function structure

Add a bounded context:

```text
backend/src/modules/content-analysis/
├── domain/
│   ├── content-analysis.ts
│   └── content-analysis.policy.ts
├── application/
│   ├── content-analysis.dto.ts
│   ├── content-analysis.repository.ts
│   ├── content-analysis.service.ts
│   ├── content-analyzer.port.ts
│   ├── thread-analysis-context.port.ts
│   └── report-analysis-context.port.ts
├── infrastructure/
│   ├── lambda-content-analyzer.ts
│   ├── content-analysis.tables.ts
│   └── drizzle-content-analysis.repository.ts
├── presentation/
│   ├── content-analysis.controller.ts
│   ├── content-analysis.routes.ts
│   └── content-analysis.schemas.ts
└── index.ts

backend/src/functions/content-analysis/
├── handler.ts
├── bedrock-content-analyzer.ts
├── contracts.ts
└── prompt.ts
```

Required backend dependency flow remains:

```text
Route → Controller → Service → Repository/analysis ports → infrastructure adapters
```

`handler.ts` is the Lambda composition root. It may import AWS SDK adapters but must not contain moderation policy or database access. The content-analysis module must not query another module's concrete tables directly. Inject context ports implemented by Discussions, Moderation, Societies, and Media.

Add AWS SDK clients through the owning package manager:

```text
@aws-sdk/client-lambda
@aws-sdk/client-bedrock-runtime
```

The ECS adapter uses `@aws-sdk/client-lambda`; function code uses `@aws-sdk/client-bedrock-runtime` and the existing S3 client.

### 7.1 Queue dispatcher refactor

Refactor the strict `AuditEventConsumer` into a union-event dispatcher:

```text
receive
  → parse and validate event version
  → record immutable audit receipt
  → invoke idempotent event handler
  → acknowledge only after durable completion
```

Retry behavior:

- duplicate audit receipt is success, but handler completion must still be checked;
- Lambda service errors, Bedrock throttling, and transient S3 failures use bounded exponential backoff;
- Lambda `FunctionError`, malformed output, and schema-invalid output are processing failures;
- unsupported event versions remain unacknowledged and eventually reach the DLQ;
- extend SQS visibility while synchronous Lambda analysis runs;
- cap function timeout and SDK request timeout below the visibility deadline;
- never log post bodies, comments, image bytes, model output, credentials, or presigned URLs.

## 8. Database changes

### 8.1 `integration_outbox_events`

| Column            | Purpose                              |
| ----------------- | ------------------------------------ |
| `event_id`        | UUID primary key and idempotency key |
| `event_type`      | Versioned event type                 |
| `version`         | Contract version                     |
| `payload`         | Minimal reference payload            |
| `occurred_at`     | Domain occurrence time               |
| `published_at`    | Nullable successful publish time     |
| `attempt_count`   | Relay attempt count                  |
| `last_error_code` | Sanitized operational error          |

The relay publishes unpublished rows and then marks them published. Direct post-commit publishing is insufficient because an SQS outage could leave a thread pending without a durable event.

### 8.2 `content_analysis_runs`

| Column                    | Purpose                                        |
| ------------------------- | ---------------------------------------------- |
| `id`                      | Analysis UUID                                  |
| `source_event_id`         | Triggering event UUID                          |
| `run_number`              | Supports explicit reanalysis                   |
| `trigger_type`            | Thread creation, update, report, or reanalysis |
| `thread_id`               | Target thread                                  |
| `report_id`               | Nullable report association                    |
| `status`                  | `queued`, `running`, `succeeded`, or `failed`  |
| `decision`                | Nullable `allow` or `review`                   |
| `sentiment_label`         | Nullable sentiment result                      |
| `confidence`              | Nullable bounded confidence                    |
| `findings`                | Structured JSON result                         |
| `input_snapshot`          | Restricted analysis evidence/context           |
| `input_hash`              | Reproducibility and stale detection            |
| `model_id`                | Invoked Bedrock model                          |
| `lambda_function_version` | Deployed function version or alias             |
| `lambda_request_id`       | Invocation correlation                         |
| `prompt_version`          | Prompt contract version                        |
| `policy_version`          | Community policy version                       |
| `attempt_count`           | Invocation attempts                            |
| `error_code`              | Sanitized final error                          |
| `context_captured_at`     | Snapshot time                                  |
| `started_at`              | Processing start                               |
| `completed_at`            | Processing completion                          |
| `created_at`              | Row creation                                   |

Add a unique constraint on `(source_event_id, run_number)`.

### 8.3 Existing tables

- Extend thread status with `pending_analysis` and `pending_review`.
- Add indexes supporting moderation queries by analysis status and age.
- If automated flags reuse `reports`, add a controlled `source` field and allow nullable `reporter_id` only when `source = 'automated'`.
- Preserve `integration_audit_events` as immutable receipt evidence.
- Re-export new tables from `backend/src/db/schema.ts`.
- Generate migrations with Drizzle Kit; never edit generated metadata manually.

## 9. API and frontend behavior

Suggested endpoints:

```text
GET  /api/v1/threads/:threadId/analysis-status
GET  /api/v1/mod/reports/:reportId/analysis
POST /api/v1/mod/reports/:reportId/reanalyze
```

Authorization:

- thread author may read limited status and a user-safe summary;
- active society moderators may read full analysis for their society;
- system admins may read all analyses;
- frontend route guards never replace service authorization.

Frontend states:

- after submission: `Post submitted for automated review`;
- author status: `Analyzing`, `Published`, or `Needs moderator review`;
- moderator report view shows decision, sentiment, findings, confidence, context scope, capture time, and stale warning;
- label output as AI assistance, not a final moderation decision;
- allow moderators to act while analysis is pending or unavailable.

## 10. Configuration

Backend/ECS:

```text
CONTENT_ANALYSIS_MODE=off|shadow|enforce
CONTENT_ANALYSIS_LAMBDA_FUNCTION=
CONTENT_ANALYSIS_LAMBDA_QUALIFIER=
CONTENT_ANALYSIS_POLICY_VERSION=
CONTENT_ANALYSIS_PROMPT_VERSION=
ANALYSIS_MAX_COMMENTS=40
ANALYSIS_MAX_IMAGES=
ANALYSIS_MAX_IMAGE_BYTES=
ANALYSIS_MAX_TOTAL_IMAGE_BYTES=
ANALYSIS_TIMEOUT_MS=
```

Lambda:

```text
BEDROCK_MODEL_ID=
ALLOWED_MEDIA_BUCKET=
ALLOWED_MEDIA_PREFIX=
MAX_MODEL_TOKENS=
LOG_LEVEL=info
```

Modes:

- `off`: preserve current publication behavior for local development;
- `shadow`: analyze asynchronously without changing visibility;
- `enforce`: create or edit threads as `pending_analysis` and gate publication.

Production configuration must fail validation when mode is `shadow` or `enforce` but Lambda settings are missing. Lambda startup must fail closed when model, bucket, or resource-limit settings are missing.

## 11. Security and moderation safeguards

- AI never bans members, suspends users, or permanently removes content.
- Route uncertain, high-risk, invalid-output, and exhausted-failure outcomes to humans.
- Remove the current public-read bucket policy and use private/signed media delivery before claiming media confidentiality.
- Invoke only the configured function ARN and optional alias.
- Grant the Lambda role only required logging, `s3:GetObject` on the media prefix, and `bedrock:InvokeModel` permissions.
- Grant the ECS task only `lambda:InvokeFunction` on the analysis function.
- Keep Lambda outside the VPC; it has no database credentials or network path to RDS.
- Validate S3 bucket, key prefix, MIME type, object metadata, image count, and byte limits before model invocation.
- Do not send voter identities, author email, reporter email, credentials, or unrelated profile data.
- Delimit untrusted content and harden prompts against prompt injection.
- Record policy, model, prompt, and function versions for every result.
- Restrict raw snapshots to moderators/system admins and define retention.
- Avoid logging content, snapshots, image bytes, or complete model responses.
- Popularity and sentiment never prove validity.

## 12. Observability and operations

Use structured CloudWatch logs containing identifiers and operational metadata only:

- source event, thread/report, and analysis IDs;
- attempt number and outcome;
- ECS-to-Lambda latency and total processing latency;
- Lambda request ID, function version, and sanitized error code;
- Bedrock request ID, model ID, latency, throttling, and token usage when available;
- SQS receive, visibility-extension, and acknowledgement result.

Monitor:

- age of oldest pending outbox event;
- age of oldest `pending_analysis` thread;
- SQS queue depth and oldest-message age;
- DLQ depth;
- Lambda errors, duration, throttles, and concurrent executions;
- Bedrock latency, throttling, token usage, and invocation failures;
- invalid response count;
- moderator override/false-positive rate;
- invocation cost during demos.

Runbook requirements:

- inspect a failed event by source event ID;
- inspect an analysis attempt without exposing content in logs;
- redrive DLQ safely;
- request explicit reanalysis;
- recover threads stuck in `pending_analysis`;
- disable analysis through `CONTENT_ANALYSIS_MODE=off`;
- destroy demo resources after use.

## 13. Infrastructure plan

Provision only after Phase 0 succeeds:

- one Lambda function with bounded memory, timeout, ephemeral storage, and reserved concurrency;
- one CloudWatch log group with the existing short retention policy;
- environment variables for model and media restrictions;
- function version/alias for reproducible audit evidence;
- ECS configuration containing function ARN/alias;
- permissions using the pre-created `LabRole` only when its trust and policies are compatible.

Do not add a NAT Gateway, Lambda VPC attachment, interface VPC endpoint, dedicated ECS worker, or new IAM role without explicit approval. Do not configure an SQS event-source mapping for the MVP architecture.

Recommended initial controls:

- reserved concurrency: `1` or `2` for demo workloads;
- timeout: bounded below SQS visibility timeout;
- memory: measure before increasing;
- architecture: use the runtime/architecture supported by the build and Learner Lab;
- log retention: match the existing seven-day default;
- provisioned concurrency: disabled.

## 14. Implementation phases

### Phase 0 — AWS feasibility gate

- Confirm Lambda and the selected multimodal Bedrock model are available in active Learner Lab `us-east-1`.
- Confirm the pre-created `LabRole` trust policy permits `lambda.amazonaws.com` to assume it.
- Confirm ECS credentials can call `lambda:InvokeFunction` for the function.
- Confirm Lambda credentials can call `bedrock:InvokeModel`, read the approved S3 prefix, and write CloudWatch logs.
- Confirm model access is enabled and test one text request plus one image request.
- Decide and verify the public-to-private media delivery migration before production use.
- Stop and request approval if any condition fails. Do not add another runtime or paid networking silently.

### Phase 1 — Durable events

- Add transactional outbox table and repository behavior.
- Write thread/report events in owning transactions.
- Add outbox relay and retry handling.
- Refactor queue consumer into union-event dispatcher.
- Preserve current audit endpoint and duplicate-safe behavior.

### Phase 2 — Analysis domain and Lambda adapter

- Add content-analysis module and database table.
- Define strict request/response contracts and payload limits.
- Implement context ports.
- Implement `LambdaContentAnalyzer` using synchronous invocation.
- Add visibility heartbeat, bounded retries, timeout, and idempotency.
- Build the Lambda artifact with S3 retrieval and direct Bedrock Runtime invocation.
- Add OpenTofu resources only after Learner Lab permissions pass.

### Phase 3 — Shadow rollout

- Analyze new threads without gating publication.
- Analyze reports with capped comment and vote context.
- Build an evaluation dataset covering valid criticism, toxicity, harassment, prompt injection, text in images, benign images, and mixed-language content.
- Measure false positives, invalid responses, Lambda duration, Bedrock latency, and cost.
- Tune policy and prompt versions before enforcement.

### Phase 4 — Moderator and author UI

- Add author analysis states.
- Add AI-assist panel to moderator report details.
- Show capture time and stale/context-truncated indicators.
- Support explicit moderator-triggered reanalysis.

### Phase 5 — Enforced validation

- Enable `pending_analysis` behind `CONTENT_ANALYSIS_MODE=enforce`.
- Auto-publish only validated `allow` outcomes.
- Route every other outcome to human review.
- Add stuck-analysis recovery and DLQ demo procedure.

## 15. Testing strategy

### Domain tests

- sentiment cannot independently determine validity;
- decision and finding schema invariants;
- thread status transitions;
- context limits and deterministic comment selection;
- prompt-injection text remains untrusted input.

### Service tests

- successful `allow` publishes pending thread;
- `review` routes to moderation;
- Lambda/Bedrock failure does not publish in enforce mode;
- report workflow remains available without AI result;
- duplicate event does not duplicate effective analysis;
- stale input triggers or recommends reanalysis;
- society-scoped authorization remains enforced.

### Repository integration tests

- thread/report and outbox event commit atomically;
- source-event/run uniqueness;
- concurrent duplicate consumers remain idempotent;
- context queries return correct vote aggregates and capped comments;
- moderation and thread transitions remain transactional.

### Consumer tests

- valid union events dispatch to correct handler;
- malformed or unsupported events reach retry/DLQ path;
- message is acknowledged only after durable completion;
- duplicate audit receipt still checks handler completion;
- visibility extends during long invocation;
- shutdown aborts long polling and in-flight work safely.

### Lambda contract tests

- text-only request;
- image-only request;
- mixed text/image request;
- invalid S3 bucket, prefix, MIME type, and object metadata;
- request and image size limits;
- valid negative criticism;
- toxic positive-language content;
- harmful text embedded in an image;
- malformed model response;
- Lambda timeout, `FunctionError`, Bedrock throttling, and access denied.

### Workflow acceptance tests

- UI submission automatically invokes SQS, Lambda, and Bedrock and persists audit/result evidence.
- Allowed thread becomes visible without manual database changes.
- Flagged thread appears for a moderator and remains hidden publicly.
- Report analysis includes comments and vote aggregates without voter IDs.
- Moderator can resolve a report while analysis is pending or failed.
- CloudWatch, SQS, Lambda, Bedrock, S3, and RDS provide demonstrable AWS invocation evidence.

## 16. AWS Academy blocker

Lambda requires an execution role trusted by `lambda.amazonaws.com`. Direct Bedrock inference requires model-access and `bedrock:InvokeModel`; private media retrieval requires narrow `s3:GetObject`. The ECS backend requires `lambda:InvokeFunction`.

The project targets AWS Academy Learner Lab, where creating or modifying IAM roles is generally blocked and the existing `LabRole` must be reused. Phase 0 is therefore a hard gate. Reuse `LabRole` only after verifying its trust policy and effective permissions in the active lab.

Do not add Terraform-managed IAM users, application roles, inline role policies, NAT Gateway, or interface endpoints without explicit evidence and approval.

## 17. Open decisions

1. Exact global policy categories defining a valid post.
2. Whether rollout stops at shadow mode or later gates publication.
3. Whether AI-flagged threads create automated reports or use a separate review status.
4. Maximum comments, images, image bytes, invocation payload, and snapshot retention.
5. Which multimodal Bedrock model the active lab permits.
6. Whether users see finding details or only status.
7. Moderator override and reanalysis rules.
8. Behavior for unsupported media and animated images.
9. Final Lambda memory, timeout, and reserved-concurrency values after measurement.

Recommended defaults:

- start in `shadow` mode;
- require human review for every non-allow outcome;
- sample 20 latest plus 20 highest-scored comments;
- include vote aggregates but no voter identities;
- retain restricted evidence for 90 days;
- use reserved concurrency `1` during coursework evaluation;
- move to enforced gating only after agreed false-positive targets pass.

## 18. References

- [Invoke a Lambda function synchronously](https://docs.aws.amazon.com/lambda/latest/api/API_Invoke.html)
- [Lambda quotas](https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html)
- [Lambda execution roles](https://docs.aws.amazon.com/lambda/latest/dg/lambda-intro-execution-role.html)
- [Lambda VPC internet access](https://docs.aws.amazon.com/lambda/latest/dg/configuration-vpc-internet.html)
- [Amazon Bedrock Converse API](https://docs.aws.amazon.com/bedrock/latest/userguide/conversation-inference.html)
- [Amazon Bedrock image source](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_ImageSource.html)
- [Amazon Bedrock model invocation IAM actions](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_InvokeModel.html)
- [Existing SQS audit implementation guide](./SQS_THREAD_AUDIT_GUIDE.md)
- [Backend architecture baseline](./BACKEND_ARCHITECTURE.md)
