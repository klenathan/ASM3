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

## Ticket #9 — Glue dataset and Athena metric contract

Resolves [klenathan/ASM3#9](https://github.com/klenathan/ASM3/issues/9).
The contract keeps the four existing metric groups and the existing
`analytics_metrics` repository boundary. Glue and Athena are data-plane
services; the ECS orchestrator remains responsible for starting jobs, polling
completion, and persisting result rows.

### S3 layout and retention

The analytics bucket is private and uses SSE-S3. A Glue run writes one
consistent PostgreSQL snapshot to these locations:

```text
s3://<analytics-bucket>/analytics/source/table=users/
snapshot_at=20260827T120000Z/snapshot_id=<run-id>/part-*.parquet
s3://<analytics-bucket>/analytics/source/table=societies/
  snapshot_at=20260827T120000Z/snapshot_id=<run-id>/part-*.parquet
...
s3://<analytics-bucket>/analytics/query-results/<athena-query-files>
s3://<analytics-bucket>/analytics/glue-temp/<temporary-files>
s3://<analytics-bucket>/analytics/manifest/part-*.parquet
```

The source dataset contains `users`, `societies`, `threads`, `comments`,
`memberships`, `votes`, and `reports`, plus a `snapshot_manifest` metadata
table. `society_id` is retained where the
source or join supplies it; votes remain a platform-wide count, matching the
current metric behavior. `snapshot_at` and `snapshot_id` are partition keys.
The Glue job reads all seven source tables in one PostgreSQL repeatable-read
transaction. It writes the manifest only after every table succeeds. Athena
selects the newest manifest row and joins every source table to that exact
`snapshot_at`/`snapshot_id` pair, so a partial or mixed snapshot cannot become
the dashboard input. The run ID prevents same-day manual refreshes from
overwriting one another.

Only the source data and snapshot manifest are retained for 30 days. Athena result files are retained
for 7 days and Glue temporary files for 1 day. `analytics_metrics` in RDS is
the durable dashboard history and is not subject to the S3 lifecycle rules.

### Glue Catalog

Glue owns one database, `analytics`, with one external Parquet table for each
source table and an unpartitioned `snapshot_manifest` table. Every source table has its source columns plus the partition keys
`snapshot_at string` and `snapshot_id string`; the table location is the
corresponding `analytics/source/table=<name>/` prefix. The export job updates
the catalog partitions as it writes each table. No crawler is required, which
keeps the daily path deterministic and avoids an additional scheduled service.

The dataset is deliberately not one wide denormalized table. The six joins
needed by the metric groups are small in the coursework deployment, and
separate tables preserve source-column meaning and make future metric queries
local. Partitioning is limited to snapshot identity: partitioning by society,
status, or individual event dates would create small-file and high-partition
overhead for a full daily export.

### Athena query contract

The ECS service runs one static query per metric group from
`backend/src/modules/analytics/infrastructure/athena-sql-catalog.ts`. Each
query selects the greatest `snapshot_at` for every source table and returns
zero or more rows with exactly these columns:

| Column | Athena type | Meaning |
| --- | --- | --- |
| `metric_type` | `varchar` | One of the four metric group names |
| `society_id` | `varchar` nullable | Empty/null for platform-wide rows |
| `period_start` | `timestamp` | UTC start of the daily metric period |
| `period_end` | `timestamp` | UTC inclusive end of the daily metric period |
| `data` | `varchar` | JSON object containing the group payload |

The adapter converts this string result into the application row
`{metricType, societyId, periodStart, periodEnd, data}`. Athena's header row is
ignored, all result pages are consumed, empty `society_id` values become
`null`, and malformed metric/date/JSON values fail the refresh rather than
being partially persisted. The existing service converts payload keys to the
API's camelCase form.

The payloads retain these fields:

- `user_growth`: `registrations`, `active_users`, `total_users`, `suspensions`
- `content_volume`: `threads`, `comments`, `votes`, `reports`
- `top_societies`: `top_by_members` and `top_by_threads` entries containing society ID, name, member count, and thread count
- `moderation`: `pending_reports`, `resolved_today`, `avg_resolution_hours`, `total_reports`

Athena uses the configured `analytics` workgroup and its S3 result location.
Every query includes the `ClientRequestToken` `<run-id>:<metric-type>` so a
reconciler retry reuses the same Athena execution.

### Metric-parity acceptance criteria

Ticket #9 is accepted when a Glue snapshot and the four Athena queries satisfy
all of the following against the same RDS fixture and UTC date:

1. The snapshot contains all seven source tables, every table has matching
   row counts and required columns, and every partition points to the same
   `snapshot_at`/`snapshot_id` pair.
2. One platform-wide row exists for each metric group, with the four current
   payload shapes and the expected daily period.
3. `content_volume` and `moderation` also return one row per represented
   society, without changing the existing platform-wide totals.
4. `top_societies` returns the same top-ten ordering by active members and
   threads, with society IDs and names stable under ties.
5. Re-running the same run ID is idempotent: Athena reuses its query token and
   persistence updates the same `(metric_type, society_id, period_start)`
   record rather than creating a duplicate.
6. A paginated Athena response produces the same rows as an unpaginated
   response, and an invalid row prevents any rows from that refresh from being
   persisted.
7. The admin API and dashboard still expose `user_growth`, `content_volume`,
   `top_societies`, and `moderation` without a response-schema change.

The migration is not considered cut over until these checks pass and ticket
#8 removes the old EMR Serverless/Lambda resources with a documented rollback
boundary.

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
  adapter passes the run ID as `--refresh-run-id`, checks recent Glue runs for
  that argument before calling `StartJobRun`, and returns the existing run ID
  on replay. Glue has no native client idempotency token, so this lookup plus
  the deterministic snapshot manifest is the idempotency boundary.
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

### Gateway interfaces implemented by ticket #9

The real adapters (using `@aws-sdk/client-glue` / `@aws-sdk/client-athena`)
implement these application-layer ports exactly
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

The placeholder gateways remain available for isolated local wiring tests, but
the production composition root uses the real adapters and the SQL catalog.

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
