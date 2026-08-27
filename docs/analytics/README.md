# Analytics — Glue + Athena Pipeline

## Purpose

Assessment 3 requires an Analytics-category AWS service invoked automatically
by application or UI code. A system administrator can trigger
`POST /api/v1/admin/analytics/refresh` and receive `202 Accepted`; EventBridge
Scheduler invokes the nightly route at `cron(0 2 * * ? *)` UTC. Both triggers
are handled by the ECS backend orchestrator and preserve the existing admin
API, dashboard, four metric groups, and persisted `analytics_metrics` rows.

## Final Architecture

```text
Admin refresh or EventBridge Scheduler
  -> ECS backend orchestrator
  -> AWS Glue export job
  -> private analytics S3 bucket
     analytics/source/table=<name>/snapshot_at=<utc>/snapshot_id=<run-id>/
      analytics/manifest/snapshot_id=<run-id>/
  -> Glue Catalog external Parquet tables
  -> four Athena metric queries
  -> AnalyticsRepository.upsertMetric
  -> RDS analytics_metrics
```

The ECS process is the only pipeline command owner. The scheduler calls
`POST /api/v1/admin/analytics/scheduled-refresh` through an API destination
using the generated `x-analytics-scheduler-secret` header. The orchestrator
records one durable PostgreSQL refresh run and returns immediately; its
reconciler starts Glue, waits for completion, starts one Athena query for each
metric group, consumes all result pages, and persists valid rows atomically
through the existing repository boundary. The run store and active-run unique
index allow unfinished work to resume after an ECS restart.
Each reconciler claims a run with a short PostgreSQL lease and uses
compare-and-set saves, preventing separate ECS tasks from starting the same
phase or overwriting a terminal state.

No analytics-specific Lambda, S3 event chain, or separate analytics artifact
build is used. The content-analysis Lambda is a separate moderation workflow
and is not part of this pipeline.

## Data Contract

Glue reads `users`, `societies`, `threads`, `comments`, `memberships`, `votes`,
and `reports` from one PostgreSQL repeatable-read transaction. It writes
Parquet partitions identified by `snapshot_at` and `snapshot_id`, then appends
the manifest only after all source tables succeed. Athena receives the
immutable refresh run ID and selects only that manifest identity, so an
overlapping or stale run cannot query another run's snapshot.
The Glue retry uses the run's immutable creation timestamp and exact run
partition, removes prior source/manifest objects for that run, and rewrites
the manifest before Athena is allowed to read it.

The Glue Catalog database is `analytics`. It contains one external table per
source table plus the unpartitioned `snapshot_manifest` table. The Athena SQL
catalog in
`backend/src/modules/analytics/infrastructure/athena-sql-catalog.ts` returns
the existing four metric groups:

- `user_growth`: registrations, active users, total users, and suspensions
- `content_volume`: platform totals plus society-scoped threads, comments, votes, and reports
- `top_societies`: top societies by members and threads
- `moderation`: pending reports, resolved reports, average resolution hours, and total reports

Every query returns `metric_type`, nullable `society_id`, UTC `period_start`,
UTC inclusive `period_end`, and JSON-object `data`. The adapter ignores Athena
header rows, consumes paginated results, converts empty society IDs to `null`,
and rejects malformed rows before persistence.

## AWS Resources And Cost

The `enable_analytics_pipeline` flag defaults to `false` and gates the shared
analytics S3 bucket as well as Glue, Catalog, Athena, VPC, lifecycle, and
Scheduler resources. Scheduler retries use an SQS DLQ. The generated scheduler
secret is stored in Secrets Manager and injected into ECS without exposing it
in the task environment. The bucket is private and uses SSE-S3. Retention is 30
days for source snapshots and manifests, 7 days for Athena result files, and
1 day for Glue temporary files. RDS `analytics_metrics` is the durable
dashboard history and is not subject to those S3 lifecycle rules.

Glue uses one `G.1X` worker with concurrency one and Athena uses one configured
workgroup. The deployment reuses `LabRole`, avoids additional IAM resources,
and does not provision duplicate compute. Destroy the demo stack with
`tofu destroy`; stopping the Learner Lab does not reliably stop RDS or clean
up S3 data.

## Verification And Rollback Boundary

Before infrastructure cutover, verify against the same RDS fixture and UTC
date that:

1. All seven source tables and the manifest use one snapshot identity.
2. The four metric groups have the expected payloads and daily periods.
3. Society-scoped rows and platform totals match the existing dashboard.
4. Top-society ordering and IDs remain stable under ties.
5. Repeating a run ID reuses Glue/Athena work and the same persistence keys.
6. Pagination produces the same result and an invalid row persists nothing.
7. The admin API response shape and dashboard groups are unchanged.

Database migrations are forward-only and applied in order through
`pnpm db:migrate`. The current analytics boundary is migrations 0013
(`analytics_metrics` nullable platform-key normalization), 0014 (durable
refresh runs), and 0015 (refresh-run leases). The migration preflight retains
the newest row per legacy `(metric_type, period_start)` platform key before
0013 creates its unique index; it does not edit generated migration files.
For rollback, deploy code compatible with the already-applied schema and
restore data from the database backup if required. Do not delete or rewrite an
applied Drizzle migration; roll forward with a new generated migration.

After these checks pass, applying this cutover removes the previous analytics
deployment resources and artifacts. Rollback is deliberately outside normal
runtime behavior: restore the pre-cutover Git revision, rebuild from that
revision, and reapply its infrastructure. The shared analytics bucket remains
the durable handoff boundary; no automatic fallback deployment is maintained.

## Operations

1. Verify the active LabRole trust and permissions, then set
   `enable_analytics_pipeline = true`,
   `analytics_learner_lab_permissions_confirmed = true`, and, for deployed
   scheduling, set `analytics_glue_job_name` in `infras/terraform.tfvars`.
2. Run `tofu plan` and `tofu apply` from `infras/`.
3. Trigger the Admin Center refresh or call the admin refresh endpoint.
4. Verify `GET /api/v1/admin/analytics`, Glue job history, Athena query history,
   and the scheduler/API destination configuration.
5. Run `tofu destroy` after the demonstration, using
   `force_destroy_buckets = true` only when deleting non-empty demo buckets is
   intended.
