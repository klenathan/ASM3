# Analytics Pipeline: Glue + Athena

This document defines the action-event analytics data, orchestration, verification, and rollback contract.

## Runtime ownership

The ECS backend owns the API boundary and durable refresh request. The managed Step Functions workflow owns the long-running AWS lifecycle:

1. `POST /api/v2/admin/analytics/refresh` authorizes a `system_admin`, creates a durable run, starts Step Functions, and returns `202 Accepted`.
2. EventBridge invokes `POST /api/v2/admin/analytics/scheduled-refresh` through an API destination authenticated with `x-analytics-scheduler-secret`.
3. Step Functions marks phases, waits for one Glue export, runs three Athena queries in parallel, and invokes the Lambda to retrieve and persist rows.

The lifecycle is `requested -> exporting -> querying -> completed`, with `failed` and `cancelled` as terminal states. Step Functions owns retry and timeout handling. Athena receives `<run-id>:<metric-kind>` request tokens, and metric upserts are safe to replay.

The ECS process does not poll Glue or Athena. The Admin Center reads the durable latest-run status endpoint while an execution is active.

## S3 and Glue contract

The private analytics bucket is named `${project}-analytics-${accountId}` and uses SSE-S3. Glue reads `action_events`, `memberships`, and `votes` from PostgreSQL through separate JDBC reads. It writes Parquet under:

```text
s3://<analytics-bucket>/analytics/source/table=<name>/
  [event_date=YYYY-MM-DD/]snapshot_at=<utc>/snapshot_id=<run-id>/part-*.parquet
s3://<analytics-bucket>/analytics/manifest/snapshot_id=<run-id>/part-*.parquet
s3://<analytics-bucket>/analytics/query-results/<athena-files>
s3://<analytics-bucket>/analytics/glue-temp/<temporary-files>
```

Action events are exported only for the requested UTC half-open range. Exports omit direct user identifiers. A manifest is written only after all three source exports succeed. Athena receives the immutable run ID and selects only its matching partitions, so a failed or partial run is never queryable.

The Glue Catalog database is `analytics`. It contains external Parquet tables for `action_events`, `memberships`, and `votes`. Source tables expose run partition keys; action events additionally expose `event_date`. No crawler is required because Glue updates partitions while writing.

S3 retention is 30 days for source snapshots and manifests, 7 days for Athena results, and 1 day for Glue temporary files. Durable action metrics remain in the RDS `analytics_action_metrics` table.

## Athena contract

`backend/src/modules/analytics/infrastructure/action-athena-sql-catalog.ts` contains one query for each action metric kind:

- `activity`: event counts, distinct pseudonymous actors, reaction deltas, and membership deltas.
- `current_state`: authoritative reaction and active-membership balances from the RDS snapshot.
- `reconciliation`: an explicit status for comparisons that are not computable from the retained event boundary.

Every query returns metric dimensions, UTC period boundaries, an optional snapshot timestamp, and JSON-object `data`. The result parser rejects missing columns, invalid dimensions, invalid dates, and malformed JSON before persistence.

## Database and deployment

Migrations are forward-only and generated from the Drizzle schema. The legacy snapshot metric table is removed by the current cutover migration; the action-event tables and refresh-run table remain. Do not edit applied migration files or generated metadata.

The Lambda runs in private database subnets with the existing `LabRole`, RDS CA validation, and interface endpoints for Athena, Secrets Manager, and CloudWatch Logs. The workflow is deployed only when `enable_analytics_pipeline` is enabled.

## Verification and rollback

Verify the complete path with deterministic product activity:

1. Seed product activity.
2. Request a bounded refresh from the Admin Center or invoke the scheduled route.
3. Confirm the durable refresh lifecycle and Glue manifest.
4. Confirm three Athena executions and Lambda persistence into `analytics_action_metrics`.
5. Confirm API rows for platform, society, and content grains.

Rollback application code by restoring the prior Git revision and reapplying infrastructure. Treat the database cutover as forward-only; preserve the drop migration and restore data only from an explicitly retained backup.
