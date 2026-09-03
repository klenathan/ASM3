# Analytics — Glue + Athena Pipeline

## Purpose

Assessment 3 requires an Analytics-category AWS service invoked automatically
by application or UI code. A system administrator can trigger
`POST /api/v1/admin/analytics/refresh` and receive `202 Accepted`; a scheduled
EventBridge rule invokes the nightly route at `cron(0 2 * * ? *)` UTC. Both
triggers create a durable refresh run and start a Standard Step Functions
workflow. The existing admin API, dashboard, four metric groups, and persisted
`analytics_metrics` rows remain unchanged.

## Action analytics v2

The action contract is versioned independently from the legacy snapshot
dashboard. Product writes append validated `action_events` rows in the same
transaction as thread, comment, reaction, membership, report, and moderation
state changes. The event table stores HMAC pseudonyms rather than actor user
IDs; production requires `ANALYTICS_PSEUDONYM_KEY` and a key version.

`POST /api/v2/admin/analytics/refresh` accepts an optional UTC half-open date
range (`periodStart`, `periodEnd`, maximum 31 days). If the requested start
predates the retained recording window, the API clamps the effective start to
the first retained UTC date and returns a warning; a range ending before that
date is accepted as a no-op with the same warning. One active run is allowed
per range; a same-range request coalesces and a different-range request returns
`409 ANALYTICS_REFRESH_BUSY`. The v2 status endpoint is scoped to the returned
run ID. `GET /api/v2/admin/analytics` serves activity, current-state, and
reconciliation rows with platform, society, and content grains. Activity
metrics are additive event counts; current-state metrics are authoritative RDS
balances; reconciliation metrics expose mismatches instead of silently
blending the two models.

Glue exports event rows using inclusive-start/exclusive-end UTC boundaries and
run-scoped `event_date`, `snapshot_at`, and `snapshot_id` partitions. Exports
omit `actor_user_id`. Raw event and manifest retention is configurable through
`analytics_raw_event_retention_days` and defaults to 30 days. A contract-state
row records the v2 recording start time; the API exposes it as the historical
baseline boundary.

## Final Architecture

Admin refresh or scheduled EventBridge rule
  -> ECS backend creates a durable run
  -> Standard Step Functions workflow
  -> AWS Glue export job
  -> private analytics S3 bucket
     analytics/source/table=<name>/snapshot_at=<utc>/snapshot_id=<run-id>/
      analytics/manifest/snapshot_id=<run-id>/
  -> Glue Catalog external Parquet tables
  -> four Athena metric queries in parallel
  -> analytics workflow Lambda retrieves results and persists metrics
  -> RDS analytics_metrics

The scheduler calls
`POST /api/v1/admin/analytics/scheduled-refresh` through an API destination
using the generated `x-analytics-scheduler-secret` header. The backend records
one durable PostgreSQL refresh run and starts the workflow, then returns
immediately. Step Functions owns Glue completion waiting, runs the four Athena
queries in parallel, and invokes the analytics workflow Lambda to retrieve
validated result pages and persist them through the existing repository.
The backend does not poll Glue or Athena. The API exposes the latest durable
workflow state for the Admin Center.

The workflow Lambda runs in the private database subnets, uses the existing
LabRole, and reaches RDS plus Athena through VPC interface endpoints. The
content-analysis Lambda remains a separate moderation workflow.

## Data Contract

Glue reads `users`, `societies`, `threads`, `comments`, `memberships`, `votes`,
and `reports` from PostgreSQL through separate JDBC reads. It writes Parquet
partitions identified by `snapshot_at` and `snapshot_id`, then writes the
manifest only after all source tables succeed. Athena receives the immutable
refresh run ID and selects only that manifest identity, so a partial failed run
is never queryable.

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

## Demo data seeding

Use the checked-in seeder to populate PostgreSQL source tables with deterministic
RMIT activity. It creates demo users, memberships, threads, comments, votes, and
pending/resolved reports; it does **not** write `analytics_metrics` directly.
The normal Glue snapshot and Athena queries therefore remain the source of the
dashboard data.

From `backend/`:

```bash
pnpm db:migrate
pnpm db:seed
pnpm analytics:demo
```

The script is repeatable. It uses a fixed ID namespace and upserts only its
`analytics.demo.*@rmit.edu.au` users and related records. Use `--users 60` to
increase the synthetic population (12–200 users are accepted). To seed and
immediately request the authenticated scheduled-refresh route, configure
`ANALYTICS_API_URL` (defaults to `http://localhost:3000`) and
`ANALYTICS_SCHEDULER_SECRET`, then run:

```bash
pnpm analytics:demo -- --refresh
```

Without `--refresh`, click **Refresh analytics** in Admin Center after the
seeder completes. Wait for the refresh status to become `completed`, then
reload the analytics dashboard. The refresh can take several minutes because
it runs Glue, four parallel Athena queries, and the workflow persistence step.

The script requires at least five active societies, so run `pnpm db:seed` first
against a new database. It is intended for a live coursework demo; remove the
demo rows or destroy the demo stack afterward.

## AWS Resources And Cost

The `enable_analytics_pipeline` flag defaults to `false` and gates the shared
analytics S3 bucket, Glue, Catalog, Athena, VPC endpoints, Step Functions,
workflow Lambda, lifecycle, and scheduled EventBridge resources. EventBridge
delivery retries use an SQS DLQ. The generated scheduler secret is stored in
Secrets Manager and injected into ECS without exposing it in the task
environment. ECS is permitted HTTPS access to the private interface endpoints;
without that rule, ECS secret injection and `awslogs` delivery time out. The
bucket is private and uses SSE-S3. Retention is 30 days for source snapshots
and manifests, 7 days for Athena result files, and 1 day for Glue temporary
files. RDS `analytics_metrics` is the durable dashboard history and is not
subject to those S3 lifecycle rules.

Database migrations are forward-only and applied in order through
`pnpm db:migrate`. The legacy analytics boundary is migrations 0013
(`analytics_metrics` nullable platform-key normalization), 0014 (durable
refresh runs), and 0015 (refresh-run leases). The action analytics boundary is
migrations 0017 (`action_events` and contract state), 0018
(`analytics_action_metrics`), and 0019 (range-aware refresh runs). Migration
0017 initializes contract version 2 and its recording-start timestamp. The
migration preflight retains the newest row per legacy `(metric_type,
period_start)` platform key before 0013 creates its unique index; it does not
edit generated migration files.
configured workgroup. The deployment reuses `LabRole`, avoids additional IAM
resources, and does not provision duplicate compute. The workflow Lambda is
reserved to one concurrent invocation. Destroy the demo stack with
`tofu destroy`; stopping the Learner Lab does not reliably stop RDS or clean up
S3 data.

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

For rollback, deploy code compatible with the already-applied schema and
restore data from the database backup if required. Do not delete or rewrite an
applied Drizzle migration; roll forward with a new generated migration.

After these checks pass, applying this cutover removes the previous analytics
deployment resources and artifacts. Rollback is deliberately outside normal
runtime behavior: restore the pre-cutover Git revision, rebuild from that
revision, and reapply its infrastructure. The shared analytics bucket remains
the durable handoff boundary; no automatic fallback deployment is maintained.

## Operations

1. Verify the active Learner Lab service list and LabRole trust/permissions.
   Step Functions is not confirmed by the checked-in service list; do not
   apply until the active lab explicitly provides it. Then set
   `enable_analytics_pipeline = true`,
   `analytics_learner_lab_permissions_confirmed = true`, and, for deployed
   scheduling, set `analytics_glue_job_name` in `infras/terraform.tfvars`.
2. From `backend/`, run `pnpm install --frozen-lockfile` and
   `pnpm build:analytics-workflow`.
3. Run `tofu plan` and `tofu apply` from `infras/`.
4. Trigger the Admin Center refresh or call the admin refresh endpoint.
5. Verify `GET /api/v1/admin/analytics`, the refresh status endpoint, Glue job
   history, Athena query history, and the scheduler/API destination
   configuration.
6. Run `tofu destroy` after the demonstration, using
   `force_destroy_buckets = true` only when deleting non-empty demo buckets is
   intended.
