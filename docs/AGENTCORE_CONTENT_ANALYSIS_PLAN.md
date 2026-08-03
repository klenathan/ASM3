# AgentCore Content Analysis Plan

Status: proposed  
Scope: automated thread validation and report-context analysis  
AWS region: `us-east-1`

## 1. Objective

Use Amazon Bedrock AgentCore Runtime to host a moderation agent that evaluates thread text and attached images. Analyze reported content with additional context from comments and votes. Preserve an auditable, asynchronous workflow through the existing `thread-events` Amazon SQS queue.

AgentCore provides runtime hosting and invocation. A multimodal Amazon Bedrock foundation model performs text and image analysis.

Sentiment is supporting information, not a validity rule. Negative criticism can be policy-compliant, while positive text can still violate policy. Validity must be evaluated against global community policy and society rules.

## 2. Recommended architecture

Visual companion: [AgentCore content-analysis Excalidraw diagram](./AGENTCORE_CONTENT_ANALYSIS_ARCHITECTURE.excalidraw).

```text
Thread creation/update
  → PostgreSQL transaction
      → thread: pending_analysis
      → transactional outbox event
  → outbox relay
  → thread-events SQS
  → single event dispatcher
      → integration audit record
      → ContentAnalysisService
      → AgentCore Runtime
      → analysis result
      → publish thread or send to moderator review
  → acknowledge SQS message
```

Use one queue dispatcher because multiple consumers on one SQS queue compete for messages. Independent audit and AI consumers would not each receive every event. If separate workers become necessary, introduce Amazon SNS or EventBridge fan-out to dedicated audit and analysis queues.

The low-cost coursework default remains one dispatcher inside the backend ECS process. Move it to a dedicated ECS worker only when measured workload requires it.

## 3. New-thread analysis flow

1. Validate membership, media ownership, and normal thread input.
2. Create the thread with status `pending_analysis`.
3. Write a versioned `thread.created` event to a transactional outbox in the same database transaction.
4. An outbox relay publishes the event to the existing `thread-events` queue.
5. The queue dispatcher validates the event and writes an immutable integration audit record.
6. `ContentAnalysisService` rehydrates authoritative context:
   - thread title and body;
   - current society rules;
   - attached, ready image media references.
7. AgentCore retrieves private images from S3 and invokes a multimodal Bedrock model.
8. The backend validates and stores the structured result.
9. Apply the result transactionally:
   - `allow` → set thread to `published`;
   - `review` → set thread to `pending_review` and add it to the moderation workflow;
   - exhausted processing failure or DLQ → set thread to `pending_review`, never silently publish.
10. Acknowledge the SQS message only after audit and analysis state are durable.

Any material edit to thread title, body, or media must emit `thread.updated` and require a new analysis. While reanalysis is pending, either hide the edited version or continue showing the last approved version. MVP recommendation: hide the thread as `pending_analysis` to avoid maintaining two content versions.

## 4. Report analysis flow

1. Create the user report and a `report.created` outbox event atomically.
2. Publish the event to `thread-events` through the outbox relay.
3. Record the integration audit receipt.
4. Capture an analysis snapshot containing:
   - report reason and optional details;
   - target thread title, body, and images;
   - applicable society rules;
   - upvote count, downvote count, and net score;
   - total visible comment count;
   - latest 20 visible comments;
   - highest-scored 20 visible comments;
   - deduplicated comments with IDs, bodies, and scores;
   - `contextTruncated` when not every comment was included.
5. Invoke AgentCore with the structured snapshot.
6. Persist the result linked to the report.
7. Display the result to authorized moderators and system admins.

Do not send voter identities to AgentCore. Engagement is contextual and must not determine policy compliance.

For a reported comment, include:

- reported comment;
- parent thread title and body;
- ancestor comment chain;
- nearby replies within a configured cap;
- comment and thread vote aggregates.

Report handling must remain available while analysis is pending or failed. If analysis finishes after report resolution, retain it as audit evidence but do not automatically change the moderator decision.

## 5. Event contracts

Queue messages contain references, not thread bodies, comments, report details, image bytes, or presigned URLs. Consumers rehydrate authoritative data by ID.

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

- `thread.created`
- `thread.updated`
- `report.created`
- optionally `report.reanalysis_requested`

Keep support for the existing `thread.created.v1` contract during migration. Introduce a minimal `thread.created.v2` contract without title or author data after all consumers support the union schema.

SQS standard queues provide at-least-once delivery. Every handler must be idempotent by `eventId`.

## 6. Agent request and response

### 6.1 Request

Send structured JSON to AgentCore containing:

- analysis ID and trigger type;
- policy and prompt versions;
- global policy and society rules;
- clearly delimited untrusted title, body, and comment text;
- S3 bucket/object references for approved image types;
- aggregate engagement context;
- context-capture timestamp.

Agent instructions must treat all user content as untrusted data and ignore instructions embedded inside posts, comments, or images.

The AgentCore execution role should receive read-only `s3:GetObject` access to the narrow thread-media object prefix. Do not make the bucket public or send long-lived credentials.

### 6.2 Response

Require strict JSON and validate it with Zod before changing thread or report state.

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

Do not request or store chain-of-thought. Evidence should contain only concise excerpts needed by moderators.

Persist:

- decision and sentiment;
- structured findings;
- model ID;
- AgentCore runtime ARN qualifier/version;
- policy and prompt versions;
- input hash;
- analysis snapshot or retained evidence references;
- context-capture timestamp;
- request/session identifier;
- processing latency;
- sanitized failure code;
- creation and completion timestamps.

## 7. Backend structure

Add a bounded context under:

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
│   ├── agentcore-content-analyzer.ts
│   ├── content-analysis.tables.ts
│   └── drizzle-content-analysis.repository.ts
├── presentation/
│   ├── content-analysis.controller.ts
│   ├── content-analysis.routes.ts
│   └── content-analysis.schemas.ts
└── index.ts
```

Required dependency flow remains:

```text
Route → Controller → Service → Repository/analysis ports → infrastructure adapters
```

The content-analysis module must not query another module's concrete tables directly. Inject explicit context ports implemented by the Discussions, Moderation, Societies, and Media modules.

Add backend dependency:

```text
@aws-sdk/client-bedrock-agentcore
```

### 7.1 Queue dispatcher refactor

Refactor the current strict `AuditEventConsumer` into a union-event dispatcher:

```text
receive
  → parse and validate event version
  → record immutable audit receipt
  → invoke idempotent event handler
  → acknowledge only after durable completion
```

Retry behavior:

- duplicate audit receipt is success, but handler completion must still be checked;
- transient AgentCore errors use bounded exponential backoff;
- invalid AgentCore output is a processing failure;
- unsupported event versions remain unacknowledged and eventually reach the DLQ;
- extend SQS message visibility while analysis runs;
- never log post bodies, comments, image bytes, credentials, or presigned URLs.

## 8. Database changes

### 8.1 `integration_outbox_events`

Transactional event delivery:

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

The relay publishes unpublished rows, then marks them published. Direct post-commit publishing is insufficient for enforced validation because an SQS outage could leave a thread permanently pending without any durable event.

### 8.2 `content_analysis_runs`

| Column                | Purpose                                        |
| --------------------- | ---------------------------------------------- |
| `id`                  | Analysis UUID                                  |
| `source_event_id`     | Triggering event UUID                          |
| `run_number`          | Supports explicit reanalysis                   |
| `trigger_type`        | Thread creation, update, report, or reanalysis |
| `thread_id`           | Target thread                                  |
| `report_id`           | Nullable report association                    |
| `status`              | `queued`, `running`, `succeeded`, or `failed`  |
| `decision`            | Nullable `allow` or `review`                   |
| `sentiment_label`     | Nullable sentiment result                      |
| `confidence`          | Nullable bounded confidence                    |
| `findings`            | Structured JSON result                         |
| `input_snapshot`      | Restricted analysis evidence/context           |
| `input_hash`          | Reproducibility and stale detection            |
| `model_id`            | Invoked model                                  |
| `runtime_qualifier`   | AgentCore deployed version                     |
| `prompt_version`      | Prompt contract version                        |
| `policy_version`      | Community policy version                       |
| `attempt_count`       | Invocation attempts                            |
| `error_code`          | Sanitized final error                          |
| `context_captured_at` | Snapshot time                                  |
| `started_at`          | Processing start                               |
| `completed_at`        | Processing completion                          |
| `created_at`          | Row creation                                   |

Add unique constraint on `(source_event_id, run_number)`.

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

- thread author may read a limited status and user-safe summary;
- active society moderators may read full analysis for their society;
- system admins may read all analyses;
- frontend route guards never replace service authorization.

Frontend states:

- after submission: `Post submitted for automated review`;
- author status: `Analyzing`, `Published`, or `Needs moderator review`;
- moderator report view shows decision, sentiment, findings, confidence, context scope, capture time, and stale warning;
- always label output as AI assistance rather than a final moderation decision;
- allow moderators to act while analysis is pending or unavailable.

## 10. Configuration

```text
CONTENT_ANALYSIS_MODE=off|shadow|enforce
AGENTCORE_RUNTIME_ARN=
AGENTCORE_RUNTIME_QUALIFIER=
CONTENT_ANALYSIS_POLICY_VERSION=
CONTENT_ANALYSIS_PROMPT_VERSION=
ANALYSIS_MAX_COMMENTS=40
ANALYSIS_MAX_IMAGES=
ANALYSIS_TIMEOUT_MS=
```

Modes:

- `off`: preserve current publication behavior; useful for local development.
- `shadow`: analyze asynchronously without changing thread visibility.
- `enforce`: create or edit threads as `pending_analysis` and gate publication.

Production must fail configuration validation when analysis mode is `shadow` or `enforce` but AgentCore settings are missing.

## 11. Security and moderation safeguards

- AI never directly bans members, suspends users, or permanently removes content.
- Route uncertain, high-risk, invalid-output, and failed analyses to humans.
- Keep media bucket private.
- Grant AgentCore only narrow S3 read and Bedrock model invocation permissions.
- Do not send voter identities, author email, reporter email, credentials, or unrelated profile data.
- Delimit untrusted content and harden prompts against prompt injection.
- Apply request-size, image-count, image-size, comment-count, and token limits.
- Record policy/model/prompt versions for every result.
- Restrict raw analysis snapshots to moderators/system admins and define retention.
- Avoid logging content, snapshots, image bytes, or complete model responses.
- Popularity and sentiment must not be treated as proof of validity.

## 12. Observability and operations

Use structured CloudWatch logs containing identifiers and operational metadata only:

- source event ID;
- thread/report ID;
- analysis ID;
- attempt number;
- outcome;
- processing latency;
- AgentCore status/error code;
- SQS receive/acknowledgement result.

Monitor:

- age of oldest pending outbox event;
- age of oldest `pending_analysis` thread;
- SQS queue depth and oldest-message age;
- DLQ depth;
- AgentCore latency and throttling;
- invalid response count;
- analysis failures and retries;
- moderator override/false-positive rate;
- invocation cost during demos.

Runbook requirements:

- inspect failed event by source event ID;
- inspect analysis attempt without exposing user content in logs;
- re-drive DLQ safely;
- request explicit reanalysis;
- recover threads stuck in `pending_analysis`;
- destroy demo resources after use.

## 13. Implementation phases

### Phase 0 — AWS feasibility gate

- Confirm AgentCore Runtime appears in the active Learner Lab Service Access list.
- Confirm selected multimodal Bedrock model is available in `us-east-1`.
- Confirm a usable AgentCore execution role exists or the lab allows creating/passing one.
- Confirm the backend `LabRole` can invoke the runtime.
- Stop and request approval if these conditions fail. Do not silently replace AgentCore with another service.

### Phase 1 — Durable events

- Add transactional outbox table and repository behavior.
- Write thread/report events in their owning transactions.
- Add outbox relay and retry handling.
- Refactor queue consumer into union-event dispatcher.
- Preserve current audit endpoint and duplicate-safe behavior.

### Phase 2 — Analysis domain and AgentCore adapter

- Add content-analysis module and database table.
- Define strict request/response contracts.
- Implement context ports.
- Implement `AgentCoreContentAnalyzer`.
- Add visibility heartbeat, bounded retries, and idempotency.
- Build AgentCore runtime artifact with multimodal model invocation.

### Phase 3 — Shadow rollout

- Run new-thread analysis without gating publication.
- Analyze user reports with comment and vote context.
- Build an evaluation dataset covering valid criticism, toxicity, harassment, prompt injection, text in images, benign images, and mixed-language content.
- Measure false positives, invalid responses, latency, and cost.
- Tune policy and prompt versions before enforcement.

### Phase 4 — Moderator and author UI

- Add author analysis states.
- Add AI-assist panel to moderator report details.
- Show capture time and stale/context-truncated indicators.
- Support explicit moderator-triggered reanalysis.

### Phase 5 — Enforced validation

- Enable `pending_analysis` behind `CONTENT_ANALYSIS_MODE=enforce`.
- Auto-publish only validated `allow` outcomes.
- Route all other outcomes to human review.
- Add stuck-analysis recovery and DLQ demo procedure.

## 14. Testing strategy

### Domain tests

- sentiment cannot independently determine validity;
- decision and finding schema invariants;
- thread status transitions;
- context limits and deterministic comment selection;
- prompt-injection text remains untrusted input.

### Service tests

- successful allow publishes pending thread;
- review outcome routes to moderation;
- AgentCore failure does not publish in enforce mode;
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
- visibility is extended during long analysis;
- shutdown aborts long polling safely.

### Agent contract tests

- text-only request;
- image-only request;
- mixed text/image request;
- valid negative criticism;
- toxic positive-language content;
- harmful text embedded in an image;
- malformed model response;
- timeout, throttling, and access-denied responses.

### Workflow acceptance tests

- UI submission automatically invokes SQS and AgentCore and persists audit/result evidence.
- Allowed thread becomes visible without manual database changes.
- Flagged thread appears for a moderator and remains hidden publicly.
- Report analysis includes comments and vote aggregates without voter IDs.
- Moderator can resolve a report while analysis is pending or failed.
- CloudWatch, SQS, AgentCore, and RDS provide demonstrable AWS invocation evidence.

## 15. AWS Academy blocker

AgentCore invocation requires `bedrock-agentcore:InvokeAgentRuntime`. AgentCore deployment also requires an execution IAM role trusted by `bedrock-agentcore.amazonaws.com`. The standard AgentCore CLI workflow uses IAM role management and `iam:PassRole` permissions.

The current project targets AWS Academy Learner Lab, where creating or modifying IAM roles is generally blocked and the existing `LabRole` must be reused. A pre-existing role may not have the AgentCore trust policy. Therefore Phase 0 is a hard gate: implementation can proceed only after active lab service access and role compatibility are confirmed.

Do not add Terraform-managed IAM users, application roles, or inline role policies without explicit evidence that the lab permits them.

## 16. Open decisions

1. Exact global policy categories defining a valid post.
2. Whether enforcement begins with hidden `pending_analysis` or shadow mode only.
3. Whether AI-flagged new threads become automated reports or use a separate review queue.
4. Maximum comments, images, image size, and analysis snapshot retention.
5. Which multimodal Bedrock model the lab permits.
6. Whether users can see finding details or only analysis status.
7. Moderator override and reanalysis rules.
8. Behavior for unsupported media formats and animated images.

Recommended defaults:

- start in `shadow` mode;
- require human review for every non-allow outcome;
- sample 20 latest plus 20 highest-scored comments;
- include vote aggregates but no voter identities;
- retain restricted analysis evidence for 90 days;
- move to enforced gating only after evaluation passes agreed false-positive targets.

## 17. References

- [Invoke an AgentCore Runtime agent](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-invoke-agent.html)
- [AgentCore Runtime IAM permissions](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-permissions.html)
- [AgentCore Runtime API: InvokeAgentRuntime](https://docs.aws.amazon.com/bedrock-agentcore/latest/APIReference/API_InvokeAgentRuntime.html)
- [AgentCore supported AWS Regions](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/agentcore-regions.html)
- [Fan out Amazon SNS notifications to Amazon SQS](https://docs.aws.amazon.com/sns/latest/dg/sns-sqs-as-subscriber.html)
- [Existing SQS audit implementation guide](./SQS_THREAD_AUDIT_GUIDE.md)
- [Backend architecture baseline](./BACKEND_ARCHITECTURE.md)
