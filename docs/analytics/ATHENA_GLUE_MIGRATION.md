# Analytics pipeline migration: EMR Serverless → Glue + Athena

Spec: [klenathan/ASM3#6](https://github.com/klenathan/ASM3/issues/6) (wayfinder map).
Decisions resolve in tickets #9, #11, #7, #8; this document accumulates them.

## Current state

- Admin API: `GET /api/v1/admin/analytics`, `POST /api/v1/admin/analytics/refresh` → invokes
  `analytics-dump-rds` Lambda (ECS task wiring in `infras/compute.tf`).
- Pipeline: `dump-rds` (RDS→JSONL, S3 staging) → `start-serverless` (EMR Serverless Spark,
  `compute_metrics.py`) → `load-results` (JSON output → `analytics_metrics` upserts), chained by
  S3 `_SUCCESS` notifications + nightly EventBridge cron. All three are analytics Lambdas.
- Persistence: `analytics_metrics` (`backend/src/modules/analytics/infrastructure/analytics.tables.ts`),
  unique index `(metric_type, society_id, period_start)` with nullable `society_id`; the Lambda's
  `ON CONFLICT` SQL uses a mismatched `COALESCE` form.

## Decisions

- #10 (closed): ECS backend + EventBridge Scheduler + API destinations + reconciler is the
  preferred Lambda-free orchestration pattern.

Per-ticket decisions are appended below as they land on this branch.

## Ticket #11 — Lambda-free refresh orchestration

Resolves [klenathan/ASM3#11](https://github.com/klenathan/ASM3/issues/11) per decision #10.
Implemented in `backend/src/modules/analytics/application/refresh-orchestrator.ts`
(plus ports, run store, presentation changes) and `infras/scheduling.tf`.

### Command ownership (who starts the Glue job)

The **ECS backend container is the single owner of pipeline commands**. Both
entry points funnel into `AnalyticsRefreshOrchestrator.requestRefresh(trigger)`:

- Admin-initiated: `POST /api/v1/admin/analytics/refresh` → `AnalyticsService.refresh`
  → orchestrator (`trigger = "admin"`). Response semantics preserved: 202 with
  `{accepted, message}` even when orchestration is not configured (dev no-op).
- Nightly: EventBridge Scheduler schedule → API destination (API-key connection)
  → internal backend route `POST /api/v1/admin/analytics/scheduled-refresh`,
  authenticated by a shared secret header `x-analytics-scheduler-secret` sourced
  from the `ANALYTICS_SCHEDULER_SECRET` env var (Terraform generates it via
  `random_password`; no IAM roles are created — LabRole reuse only). The route
  is *transport authentication only*; it never touches session principals.

At most one refresh run may be active at a time. A request that arrives while a
run is unfinished coalesces onto it instead of starting a second Glue export
(idempotency at command level).

### Run state / completion model

Run lifecycle: `requested → exporting (Glue) → querying (Athena) → completed`,
with terminal `failed`. State transitions:

1. `requested`: persist the run record, then start the Glue job through an
   injected `GlueGateway`, storing the returned `jobRunId`.
2. `exporting`: the bounded in-process reconciler sweep (same
   `setInterval(...).unref()` pattern as the content-analysis retry loop in
   `server.ts`) polls `getJobRunStatus(jobRunId)`; on `SUCCEEDED` the run moves
   to `querying` and one Athena query per metric group (`user_growth`,
   `content_volume`, `top_societies`, `moderation`) is started immediately;
   each query execution id is stored on the run before its results are read.
3. `querying`: the reconciler polls query statuses; when all have succeeded it
   reads rows (`{metric_type, society_id|null, period_start, period_end, data}`)
   and upserts them through the existing `AnalyticsRepository.upsertMetric`.

Completion is defined as the persistence of all Athena result rows; nothing is
removed from the old data path until the Glue/Athena adapters land (#9).

**Durability caveat (ticket #7 dependency):** runs are currently tracked by
`InMemoryRefreshRunStore` (`application/refresh-run.store.ts`) inside the
backend process, so they survive between reconciler ticks but NOT across ECS
task restarts. #7 owns the PostgreSQL-backed implementation of the same
`RefreshRunStore` port plus table/migration. Resume after restart relies on
AWS-side dedupe below, so replaying unfinished runs cannot duplicate work.

### Retry + idempotency expectations

- **Command idempotency:** one active run per process; extra triggers coalesce
  (`requestRefresh` returns the active `runId`).
- **Glue start:** retries are bounded by `maxPhaseRetries` (env
  `ANALYTICS_REFRESH_MAX_PHASE_RETRIES`, default 3); start failures increment
  the attempt counter and stay non-terminal so the reconciler retries. Real
  adapter must pass the run id as the job's idempotency token / argument
  (`--refresh-run-id`) so a replayed `StartJobRun` resolves to the same run.
- **Glue failure states** (`FAILED/ERROR/TIMEOUT/CANCELLED`) reset the run to
  `requested` up to the cap, then fail terminally.
- **Athena queries:** started once per metric group with
  `clientRequestToken = "<runId>:<metricType>"` (maps 1:1 to Athena's
  `ClientRequestToken`, which dedupes replays after crashes/resumes). A failed
  or cancelled group drops only its own stored query id; already-succeeded
  groups keep their ids and results are re-read rather than recomputed.
- **Staleness:** any unfinished run untouched for longer than
  `ANALYTICS_REFRESH_STALE_AFTER_MS` (default 45 min) is failed by the
  reconciler; the next trigger starts fresh.
- **Sweep safety:** runs are advanced at most once per tick via an in-flight
  guard; ticks swallow errors and log them (no unbounded exception loops).

### Chosen AWS services

- **EventBridge Scheduler** (`aws_scheduler_schedule.analytics_nightly_refresh`,
  cron `0 2 * * ? *` UTC, flexible window off) — replaces the old
  `aws_cloudwatch_event_rule.analytics_nightly` cron that invoked dump-rds.
- **API destination + API-key connection**
  (`aws_cloudwatch_event_api_destination.analytics_scheduled_refresh`,
  `aws_cloudwatch_event_connection.analytics_scheduler`) — POSTs the shared
  secret header to the backend route over HTTPS. API destinations require a
  public HTTPS endpoint and short handlers; our route only records intent and
  returns 202 within milliseconds (the orchestrator is async), satisfying the
  constraint documented in decision #10.
- **Amazon Glue** — started by the backend, not scheduled directly.
- **Amazon Athena** — queried by the backend reconciler.
- No new IAM resources: Scheduler target role is the pre-existing LabRole
  (`data.aws_iam_role.learner_lab`). **Academy gate:** verify the lab-managed
  LabRole can perform `events:InvokeApiDestination` and that Scheduler +
  API destinations exist in the current Associate Services lab (us-east-1)
  before applying `scheduling.tf`. Documented fallback if not permitted: an
  EventBridge-targeted one-off ECS worker task on the existing EC2 host.

### Alternatives rejected

- **Keep the three-Lambda chain** (dump-rds → start-serverless → load-results):
  violates decision #10 (zero analytics Lambdas) and splits state across three
  functions with S3 `_SUCCESS` marker chaining that cannot be resumed safely.
- **Step Functions state machine**: adds a billable always-on-stateful service,
  IAM machinery beyond the lab constraints, and duplicates reconciliation
  logic the backend must implement anyway for admin refreshes.
- **Direct EventBridge rule → API destination (cron-based CEE)**: works, but
  EventBridge Scheduler has first-class schedule management, retry policies,
  and does not require event-pattern plumbing; CEE rules remain fine but offer
  no benefit here (decision #10 named Scheduler explicitly).
- **Recurring job inside the backend process alone** (e.g. cron-like timer
  deciding "is it past 02:00 UTC yet?"): keeps infra minimal but produces
  flaky nightly timing across single-instance restarts/deployments and loses
  observability (no CloudTrail-visible invocation); the API destination also
  provides the assessment-friendly automatic invocation evidence.
- **SQS-polling worker pattern**: unused queue constant cost and delayed
  delivery timers are worse fit than a direct HTTPS ping for a once-a-day job.

### Expected gateway interfaces (contract for ticket #9's adapters)

#9's real adapters (using `@aws-sdk/client-glue` / `@aws-sdk/client-athena`)
must implement these application-layer ports exactly
(`application/refresh-orchestrator.ports.ts`):

```ts
interface GlueGateway {
  // Must forward runId as the job idempotency token / --refresh-run-id arg.
  startJobRun(input: { runId: string; arguments?: Readonly<Record<string, string>> }): Promise<string>;
  getJobRunStatus(jobRunId: string): Promise<
    "STARTING" | "RUNNING" | "STOPPING" | "SUCCEEDED"
    | "FAILED" | "ERROR" | "TIMEOUT" | "CANCELLED">;
}

interface AthenaGateway {
  // Maps to StartQueryExecution(ClientRequestToken = clientRequestToken).
  startQuery(input: { sql: string; clientRequestToken: string; outputLocation?: string }): Promise<string>;
  // Maps to GetQueryExecution → QueryExecution.Status.State.
  getStatus(queryExecutionId: string): Promise<"QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED">;
  // Maps to GetQueryResults (or paginate over OutputLocation files);
  // rows feed straight into AnalyticsRepository.upsertMetric minus id/timestamps.
  getResults(queryExecutionId: string): Promise<Array<{
    metricType: MetricType; societyId: string | null;
    periodStart: Date; periodEnd: Date; data: MetricPayload;
  }>>;
}
```

Interim placeholders (`infrastructure/placeholder-analytics-gateways.ts`)
complete instantly with zero rows so configured environments exercise the full
lifecycle without touching data until #9 lands.

Env contract (all optional, checked by `config/env.ts`):
`ANALYTICS_GLUE_JOB_NAME` (+ required `AWS_REGION`) enables the orchestrator
and reconciler; `ANALYTICS_SCHEDULER_SECRET` enables the internal route and
requires `ANALYTICS_GLUE_JOB_NAME`;
`ANALYTICS_REFRESH_RECONCILE_INTERVAL_MS` (default 60000),
`ANALYTICS_REFRESH_MAX_PHASE_RETRIES` (default 3),
`ANALYTICS_REFRESH_STALE_AFTER_MS` (default 2700000). The former
`ANALYTICS_DUMP_LAMBDA_FUNCTION` wiring was removed from
`server.ts`/`compute.tf`/`locals.tf`; the Lambda source itself remains until
ticket #8 deletes it.
