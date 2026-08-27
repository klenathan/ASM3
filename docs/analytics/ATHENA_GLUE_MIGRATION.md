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
