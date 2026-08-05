# SQS Thread-Created Audit System — Implementation Guide

This is a companion to `docs/SQS_THREAD_AUDIT_PLAN.md`. It describes how the
implemented SQS thread-created audit trail works, how to run and verify it, and
how future agents should extend the system. Read the plan first for the delivery
decision and contract rationale.

## What was implemented

When a student creates a thread, the backend publishes a versioned
`thread.created` event to an Amazon SQS standard queue. A long-polling consumer
running inside the API process records each event in the append-only
`integration_audit_events` table. This gives an automatic, observable AWS
workflow and a stable event contract for future notification/moderation
handlers.

```
UI → ThreadService.createThread → [DB transaction commits]
    → ThreadEventPublisher (SQS SendMessage)
        → thread-events queue
            → AuditEventConsumer (long poll) → integration_audit_events row → DeleteMessage
            → on repeated failure → dead-letter queue
```

Failed SQS sends never fail or roll back a committed thread; they are logged and
swallowed (see delivery decision in the plan).

## Event contract

Published message body (`ThreadCreatedEvent`):

```json
{
  "eventId": "<uuid>",
  "eventType": "thread.created",
  "version": 1,
  "threadId": "<uuid>",
  "societyId": "<uuid>",
  "authorId": "<uuid>",
  "title": "<normalized title>",
  "occurredAt": "<ISO-8601 UTC>"
}
```

The body/content is never included. Consumers should rehydrate authoritative
data by ID when needed. Message attributes carry `eventType` and `eventVersion`.

## Code map

Discussions (publisher):

- `backend/src/modules/discussions/application/thread-events.port.ts` — port,
  event type, `buildThreadCreatedEvent`, `NoopThreadEventPublisher`.
- `backend/src/modules/discussions/infrastructure/thread-events.sqs.publisher.ts`
  — `SqsThreadEventPublisher` (`@aws-sdk/client-sqs`), swallows and logs send
  failures.
- `backend/src/modules/discussions/application/thread.service.ts` —
  `createThread` publishes after `withTransaction` resolves.
- `backend/src/modules/discussions/index.ts` — composition root; `events`
  optional, defaults to the no-op publisher.

Audit (consumer):

- `backend/src/modules/audit/domain/audit.event.ts` — record types.
- `backend/src/modules/audit/application/audit-events.repository.ts` — port;
  `record` returns `"created" | "duplicate"`.
- `backend/src/modules/audit/application/audit-events.consumer.ts` —
  framework-agnostic `AuditEventConsumer`: validates shape/version, persists
  before acknowledging, treats duplicates as success, leaves malformed/failed
  messages unacknowledged, and stops on `stop()` (aborts the in-flight SQS
  receive).
- `backend/src/modules/audit/infrastructure/drizzle-audit-events.repository.ts`
  — unique-constraint-aware Drizzle insert.
- `backend/src/modules/audit/infrastructure/audit-events.tables.ts` —
  `integration_audit_events` table with a unique `source_event_id` index
  (idempotency).
- `backend/src/modules/audit/infrastructure/sqs-audit-message.source.ts` —
  SQS `ReceiveMessage`/`DeleteMessage` transport.
- `backend/src/modules/audit/index.ts` — `createAuditModule` + `start`/`stop`.

Wiring:

- `backend/src/config/env.ts` — `THREAD_EVENTS_QUEUE_URL` (optional in dev,
  required in production; requires `AWS_REGION`).
- `backend/src/server.ts` — builds the SQS publisher when configured else the
  no-op, creates/starts the audit module, and stops the consumer before closing
  the DB on `SIGTERM`.

Infrastructure (`infras/`):

- `queue.tf` — `aws_sqs_queue.thread_events` + `thread_events_dlq`, SSE, long
  polling, visibility timeout, redrive (maxReceiveCount = 5).
- `compute.tf` — backend task env `THREAD_EVENTS_QUEUE_URL`.
- `queue.tf` — SQS resource policy grants the shared Learner Lab role access;
  Terraform does not attempt to modify the pre-provisioned role.
- `outputs.tf` — `thread_events_queue_url`, `thread_events_dlq_url`.

Migration:

- `backend/drizzle/0005_*.sql` — creates `integration_audit_events`.

## Local development without AWS

Set neither `AWS_REGION`/`MEDIA_BUCKET` nor `THREAD_EVENTS_QUEUE_URL`, or leave
`THREAD_EVENTS_QUEUE_URL` unset. The discussions module uses the no-op publisher
and the audit module does not start a consumer. Threads still create normally.

## Running and verifying

Backend checks (run from `backend/`):

- `pnpm typecheck` — note: `user.service.test.ts` has pre-existing type errors
  unrelated to this feature.
- `pnpm lint`
- `pnpm test`
- `pnpm build`

The PostgreSQL integration test for the unique `source_event_id` constraint is
opt-in; it only runs when `DATABASE_URL` is set:

```bash
# start local Postgres on a free port first
POSTGRES_PORT=5433 pnpm --dir backend db:generate   # if schema changes
DATABASE_URL=postgresql://rmit_society:rmit_society_dev@localhost:5433/rmit_society \
  pnpm --dir backend exec vitest run src/modules/audit/infrastructure/audit-events.repository.integration.test.ts
```

Deploy the backend (`make push-backend`), apply infra (`make apply`), and run
migrations (`make migrate-seed`) so `integration_audit_events` and the queue
exist. Then in the UI create a thread and check:

- `SendMessage`/`ReceiveMessage`/`DeleteMessage` calls in the backend ECS
  CloudWatch log group `/ecs/<name>/backend`.
- A row in `integration_audit_events` whose `source_event_id` matches the
  `eventId` logged for the thread's `threadId`.

Reviewing/DLQ:

- `aws sqs get-queue-attributes --queue-url <primary> --attribute-names ApproximateNumberOfMessages`
- `aws sqs receive-message --queue-url <primary> --attribute-names All` (inspect)
- Re-drive DLQ back to primary:
  `aws sqs start-message-move-task --source-arn <primary-arn>`
- Teardown: `make destroy` (or run `aws sqs purge-queue` in the console
  beforehand to drop real queued/demo messages).

## How to extend (future agents)

- **Add a new event type.** Define a sibling `*Events` port mirroring
  `thread-events.port.ts`, a publisher adapter, and a consumer handler. Keep the
  same versioned, minimal-payload contract and the same idempotent, ack-after-
  persist consumer pattern.
- **Add notification/moderation consumers.** Subscribe to the same
  `thread.created` contract on the current queue, or add a second standard queue
  with its own DLQ. Services stay framework-agnostic behind a port; SQS stays in
  the infrastructure layer.
- **Move the consumer to a dedicated worker.** The consumer is behind the
  `AuditMessageSource` port, so it can run in its own ECS task without changing
  `AuditEventConsumer`. Only add a second service once workload justifies it —
  the single-host in-process consumer is intentional for the low-cost demo.
- **Guaranteed delivery (outbox).** Direct publishing accepts a small chance of
  a lost event during an SQS outage. Before adding user-facing or safety-critical
  handlers, replace direct publishing with a transactional outbox so every
  committed thread eventually emits an event. Do not hand-edit the generated
  `drizzle/` migration metadata — run `pnpm db:generate` and review the SQL.
- **Permissions.** The app runs on the shared Learner Lab role. The primary
  queue's resource policy grants `sqs:SendMessage`, `ReceiveMessage`,
  `DeleteMessage`, `ChangeMessageVisibility`, and `GetQueueAttributes` to that
  role. Do not add an `aws_iam_role_policy`: Learner Lab denies
  `iam:PutRolePolicy`. If Terraform cannot update the queue policy, the
  deployment identity needs `sqs:SetQueueAttributes`.
