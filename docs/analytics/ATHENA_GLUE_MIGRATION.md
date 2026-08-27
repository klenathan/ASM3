# Analytics Pipeline: Glue + Athena

Spec: [klenathan/ASM3#6](https://github.com/klenathan/ASM3/issues/6).
Implementation decisions are recorded in tickets #9 and #11. This document is
the final data, orchestration, verification, and rollback contract.

## Runtime Ownership

The ECS backend owns the complete analytics refresh lifecycle:

1. `POST /api/v1/admin/analytics/refresh` authorizes a `system_admin` and
   requests a refresh while preserving the existing `202 Accepted` response.
2. EventBridge Scheduler calls
   `POST /api/v1/admin/analytics/scheduled-refresh` through an API destination
   authenticated by `x-analytics-scheduler-secret`.
3. `AnalyticsRefreshOrchestrator` coalesces concurrent requests into a durable
PostgreSQL run and returns before AWS work starts. Its reconciler starts and
reconciles one Glue export under a PostgreSQL lease, starts four Athena
queries, and persists their rows through `AnalyticsRepository`. Lease-protected
compare-and-set saves prevent another ECS task from concurrently advancing the
same run or overwriting a terminal state.

The run lifecycle is `requested -> exporting -> querying -> completed`, with
`failed` as the terminal error state. Glue and Athena retries are bounded;
unfinished runs become stale after the configured threshold. Athena receives
`<run-id>:<metric-type>` client request tokens so query retries are idempotent.

## S3 And Glue Contract

The gated private bucket is named `${project}-analytics-${accountId}` and uses
SSE-S3. A Glue run reads all source data from PostgreSQL in one repeatable-read
transaction and writes:

```text
s3://<analytics-bucket>/analytics/source/table=users/
  snapshot_at=20260827T120000Z/snapshot_id=<run-id>/part-*.parquet
s3://<analytics-bucket>/analytics/source/table=<name>/...
s3://<analytics-bucket>/analytics/manifest/snapshot_id=<run-id>/part-*.parquet
s3://<analytics-bucket>/analytics/query-results/<athena-files>
s3://<analytics-bucket>/analytics/glue-temp/<temporary-files>
```

The source dataset contains `users`, `societies`, `threads`, `comments`,
`memberships`, `votes`, and `reports`. The votes export includes the resolved
`society_id` for both thread and comment votes. The manifest is written only
after all seven tables succeed. Athena is passed the current run ID and uses
only its matching `snapshot_at`/`snapshot_id` partitions for every join.
Retries reuse the run creation timestamp as `snapshot_at`, clean that run's
source and manifest prefixes, and rewrite the run-scoped manifest. The
`completed_at` ordering is deterministic if old manifest objects remain.

The Glue Catalog database is `analytics`. It contains one external Parquet
table per source table and an unpartitioned `snapshot_manifest` table. Source
tables expose their source columns plus `snapshot_at string` and
`snapshot_id string` partition keys. Glue updates partitions while writing;
no crawler is required.

S3 retention is 30 days for source snapshots and manifests, 7 days for Athena
query results, and 1 day for Glue temporary files. `analytics_metrics` in RDS
is durable dashboard history and is not covered by those lifecycle rules.

## Athena Contract

The SQL catalog factory at
`backend/src/modules/analytics/infrastructure/athena-sql-catalog.ts` contains
one query for each existing metric group and binds the current UUID snapshot
ID. Each query returns zero or more rows
with exactly:

| Column | Athena type | Meaning |
| --- | --- | --- |
| `metric_type` | `varchar` | One of the four metric group names |
| `society_id` | `varchar` nullable | Empty/null for platform-wide rows |
| `period_start` | `timestamp` | UTC start of the daily period |
| `period_end` | `timestamp` | UTC inclusive end of the daily period |
| `data` | `varchar` | JSON object containing the group payload |

The gateway consumes every result page and the parser rejects malformed metric
types, dates, IDs, or JSON. Rows are mapped to
`{metricType, societyId, periodStart, periodEnd, data}` and persisted through
the existing repository. The administrator API and dashboard response shape
remain unchanged.

## Infrastructure Contract

`infras/analytics-storage.tf` owns the gated shared S3 bucket and its policy.
`infras/glue-athena.tf` owns the Glue connection, export script object, Glue
Catalog, Glue job, Athena workgroup, VPC access, and retention rules.
`infras/scheduling.tf` owns the gated EventBridge Scheduler, API destination,
generated shared secret, retry policy, and SQS DLQ. The pre-created `LabRole` is
reused; no IAM roles or users are created. OpenTofu fails closed unless the
active LabRole trust and required permissions have been verified explicitly.

The complete analytics deployment is disabled by default. Setting
`enable_analytics_pipeline = true` enables all of these resources and wires
the Glue/Athena settings into the ECS task. No analytics-specific build step
is required; OpenTofu uploads the Glue script from
`backend/src/functions/analytics/glue/export_rds.py`.

## Acceptance Evidence

Against one RDS fixture and UTC date, the cutover is accepted when:

1. All seven source tables and the manifest point to one snapshot identity.
2. Platform rows exist for all four groups with the expected daily periods.
3. Society-scoped content and moderation rows preserve platform totals.
4. Top-society ordering, names, and IDs match the existing dashboard.
5. Repeating a run ID updates the same metric persistence keys.
6. Paginated Athena results equal unpaginated results.
7. An invalid result row prevents partial persistence.
8. Admin API and dashboard metric groups are unchanged.

## Cutover And Rollback

The acceptance evidence above is the prerequisite for applying the cutover.
After it is applied, the runtime contains only the ECS -> Glue -> Athena ->
RDS path. There is no automatic analytics fallback. If rollback is required,
restore the pre-cutover Git revision, rebuild that revision's artifacts, and
reapply its OpenTofu configuration. The shared analytics S3 bucket is retained
as the data handoff boundary, while normal teardown remains `tofu destroy`.

### Database Migration Boundary

Run `pnpm db:migrate`, not raw `drizzle-kit migrate`, so the preflight runs
before migration 0013. It deterministically deletes older duplicate
platform-wide rows for `(metric_type, period_start)`, retaining the newest by
`updated_at`, `created_at`, and `id`, then applies generated migrations 0013,
0014, and 0015 in order. Migrations are forward-only: do not edit or remove an
applied SQL file or snapshot metadata. Roll back application code only to a
revision compatible with the applied schema, and use database backup restore
for data rollback.
