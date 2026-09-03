# Analytics — Action Events with Glue + Athena

## Purpose

Analytics is an administrator-only action-event dashboard. Product writes append validated `action_events` rows in the same transaction as thread, comment, reaction, membership, report, and moderation state changes. Actor identity is stored as an HMAC pseudonym; production requires `ANALYTICS_PSEUDONYM_KEY` and a key version.

A system administrator can request a UTC half-open date range through `POST /api/v2/admin/analytics/refresh`. An EventBridge schedule invokes the authenticated `POST /api/v2/admin/analytics/scheduled-refresh` route. Both paths create one durable refresh run and start the Standard Step Functions workflow.

## API

- `GET /api/v2/admin/analytics` queries activity, current-state, and reconciliation metrics at platform, society, or content grain.
- `POST /api/v2/admin/analytics/refresh` queues a range-scoped refresh. Ranges are limited to 31 days and are clamped to the retained event window.
- `POST /api/v2/admin/analytics/refresh/cancel` cancels the latest queued or running refresh.
- `GET /api/v2/admin/analytics/refresh/status` returns the latest durable refresh status.
- `GET /api/v2/admin/analytics/refresh/:runId` returns one refresh run.

All administrator routes use the session principal and require `system_admin`. The scheduled route uses `x-analytics-scheduler-secret` and is not a browser-facing endpoint.

## Architecture

```text
Admin Center or EventBridge
  -> ECS backend creates a durable refresh run
  -> Standard Step Functions workflow
  -> AWS Glue exports action_events, memberships, and votes to private S3
  -> Glue Catalog external Parquet tables
  -> three Athena metric queries in parallel
  -> analytics workflow Lambda validates and persists rows
  -> RDS analytics_action_metrics
```

The ECS backend does not poll Glue or Athena. Step Functions owns waiting, retries, timeout handling, and fan-in. The workflow Lambda runs in the database subnets, reuses `LabRole`, and reaches RDS and Athena through the configured VPC endpoints.

## Data contract

Glue exports action events for the requested inclusive-start/exclusive-end UTC range and writes run-scoped `event_date`, `snapshot_at`, and `snapshot_id` partitions. It omits direct user identifiers. Membership and vote exports provide authoritative current-state balances. The manifest is written only after all exports succeed, so a partial run is never queryable.

The workflow produces:

- **Activity:** additive event counts and reaction/member deltas.
- **Current state:** authoritative reaction and active-membership balances from the snapshot.
- **Reconciliation:** explicit comparison status; non-comparable ranges are represented instead of silently blending models.

Rows are persisted in `analytics_action_metrics` and are replaced by metric kind, grain, target dimensions, and period. Raw action events are retained according to `analytics_raw_event_retention_days` (30 days by default).

## Demo

Run the deterministic seeder from `backend/` after `pnpm db:seed`. It creates repeatable RMIT users, societies, threads, comments, votes, memberships, and reports, then can invoke the authenticated scheduled-refresh route with `--refresh`.

```bash
ANALYTICS_API_URL=http://localhost:3000 \
ANALYTICS_SCHEDULER_SECRET='...' \
pnpm analytics:demo -- --refresh
```

Use the Admin Center Analytics tab to query each grain, request a bounded refresh, inspect the durable status, and verify the resulting metrics. Destroy or pause the demo stack after the demonstration.

## Verification

Validate the complete path in this order:

1. Seed deterministic product activity.
2. Request `POST /api/v2/admin/analytics/refresh` or run the scheduled route.
3. Confirm the durable run transitions through exporting, querying, and completed.
4. Confirm the Glue job writes the run manifest and action-event snapshot.
5. Confirm the three Athena query executions and Lambda persistence.
6. Confirm `GET /api/v2/admin/analytics` returns rows at the selected grain.
