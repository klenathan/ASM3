# SQS Thread-Created Audit Trail Plan

## Purpose

When a student creates a thread, the backend sends a `thread.created` event to Amazon SQS. A consumer records the event in an append-only audit trail. This provides an automatic, observable AWS workflow now and establishes an event contract that future notification and automated-moderation handlers can consume.

## Delivery Decision

Use direct, best-effort SQS publishing after the thread and its media references commit successfully.

- A failed SQS send must not roll back or falsely fail an already-created thread.
- The publisher logs failures with the event and thread IDs.
- This deliberately accepts a small possibility of a missing audit event during an SQS outage.
- Replace direct publishing with a transactional outbox if future notifications or moderation require guaranteed delivery.

## Event Contract

Publish a versioned `thread.created` event with:

- `eventId`: UUID generated for this delivery.
- `eventType`: `thread.created`.
- `version`: `1`.
- `threadId`, `societyId`, and `authorId`.
- `title`: normalized thread title.
- `occurredAt`: ISO-8601 UTC timestamp.

Do not include the thread body or media content. Consumers can retrieve authoritative data by ID when needed.

## Implementation Todos

### Backend

- [x] Add an application event-publisher port to the discussions module.
- [x] Inject the port into `ThreadService`.
- [x] In `ThreadService.createThread`, publish the event only after the existing transaction has committed.
- [x] Add an SQS infrastructure adapter using `@aws-sdk/client-sqs`.
- [x] Validate `AWS_REGION` and `THREAD_EVENTS_QUEUE_URL` in backend configuration.
- [x] Use a no-op publisher and do not start the consumer when the queue URL is not configured, allowing local development without AWS.
- [x] Wire the publisher and consumer from `backend/src/server.ts`; controllers remain unaware of AWS transport concerns.

## Audit Consumer

Create an audit-events module that owns an append-only `integration_audit_events` table.

- Persist a unique `source_event_id` to make at-least-once SQS deliveries idempotent.
- Store event type, version, thread/society/author IDs, payload snapshot, received timestamp, and processing status.
- Validate message shape and version before processing.
- Delete a message only after its audit record is durably written.
- Treat a duplicate `source_event_id` as successful processing and acknowledge the message.
- On malformed or persistently failing messages, leave the message unacknowledged so SQS retry and DLQ policies apply.

Initially run the long-polling consumer in the existing API process. This avoids a second ECS service on the single small EC2 host. Handle `SIGTERM` by stopping polling before the database closes; any unacknowledged messages become available for retry. Keep the consumer behind an application port so it can later run as a separate ECS worker if notification or moderation workload grows.

### Infrastructure

- [x] Add a standard SQS primary queue in Terraform.
- [x] Add a dead-letter queue and redrive policy.
- [x] Configure server-side encryption, tags, long polling, visibility timeout, and bounded receive attempts.
- [x] Add backend ECS task environment variables for `AWS_REGION` and `THREAD_EVENTS_QUEUE_URL`.
- [x] Add Terraform outputs for the primary queue and DLQ URLs.
- [x] Verify effective SQS access through the primary queue resource policy for
  the existing Learner Lab role. Do not attempt to modify `LabRole`, because
  Learner Lab denies `iam:PutRolePolicy`.

The project reuses the AWS Academy Learner Lab role and cannot provision or
modify a dedicated IAM role. The SQS queue resource policy grants that existing
role `sqs:SendMessage`, `ReceiveMessage`, `DeleteMessage`,
`ChangeMessageVisibility`, and `GetQueueAttributes` on the primary queue.

### Tests

- [x] Unit test that successful thread creation emits one event after commit.
- [x] Unit test that authorization or validation failures emit no event.
- [x] Unit test SQS command construction and publisher failure logging.
- [x] Unit test consumer validation, acknowledge-after-persist ordering, duplicate delivery handling, and shutdown behavior.
- [x] Add PostgreSQL integration coverage for the audit table's unique event-ID constraint.
- [ ] Smoke test the deployed path: UI thread creation, SQS delivery, audit-row persistence, CloudWatch logs, and a forced failure that reaches the DLQ.

### Demo And Documentation

- [ ] Demonstrate a student creating a thread through the UI.
- [ ] Correlate the thread ID and event ID in backend and consumer CloudWatch logs and the persisted audit record.
- [x] Document queue metrics, DLQ inspection/replay, teardown steps, and the direct-publish delivery limitation.

## Future Extension

Notification and automated-moderation consumers should subscribe to the same versioned `thread.created` contract. Before adding user-facing or safety-critical handlers, replace direct publishing with a transactional outbox to guarantee that every committed thread eventually produces an event.
