# Analytics — Glue + Athena Pipeline

## Purpose (Analytics AWS category)

Assessment 3 requires an **Analytics**-category AWS service invoked automatically by application/UI code. The replacement pipeline satisfies this: a System Admin triggers `POST /api/v1/admin/analytics/refresh` (202 Accepted, `system_admin` only) or EventBridge Scheduler cron `0 2 * * ? *` triggers the nightly run; the ECS backend starts Glue, queries Athena, and persists the results. The legacy EMR Serverless/Lambda chain remains provisioned only as a temporary rollback path until ticket #8's cutover.

## Legacy Rollback Architecture

```
POST /api/v1/admin/analytics/refresh (system_admin)
  → Lambda invoke (Event) analytics-dump-rds (VPC, RDS → S3 analytics/staging/<ts>/_SUCCESS)
    → S3 ObjectCreated:Put analytics/staging/_SUCCESS
      → analytics-start-serverless (StartJobRun + GetJobRun polling)
        → EMR Serverless Spark (emr-7.2.0, SPARK, max 3 vCPU/7GB, driver 1c/3GB + executor 2c/4GB×1)
          reads s3://analytics/staging/<ts>/ JSONL (6 tables) via SparkSession.getOrCreate(),
          coalesce(1).write.json to s3://analytics/output/<ts>/metrics.jsonl
            → S3 ObjectCreated:Put analytics/output/_SUCCESS
              → analytics-load-results (VPC, S3 → RDS analytics_metrics upsert on metric_type, society_id, period_start)
                → GET /api/v1/admin/analytics returns fresh metrics
```

- **S3 seams:** same bucket `${project}-analytics-${accountId}`, prefixes `analytics/staging/<ts>/`, `analytics/output/<ts>/`, `analytics/pyspark/compute_metrics.py`, `analytics/emr-serverless-logs`.
- **Polling:** `GetJobRun` every 30s, 900s timeout, `CancelJobRun` on timeout; `SUCCESS`→ success, `FAILED`/`CANCELLED`→ failure (no output `_SUCCESS`, no load).
- **Gate:** `enable_analytics_pipeline` (default `false`) controls the legacy rollback resources and the replacement Glue/Catalog/Athena resources; destroy after demo (`tofu destroy`) since `End Lab` does not stop AWS jobs or RDS.

## Glue + Athena contract

Ticket #9 adds the replacement data plane before the ticket #8 cutover. The
ECS backend starts the Glue export job and runs four Athena queries; no result
Lambda is involved in the new path. Glue writes seven source tables as
Parquet beneath `analytics/source/table=<name>/snapshot_at=<utc>/snapshot_id=<run-id>/`.
The Glue Catalog database is `analytics`, with one external table per source
table and `snapshot_at`/`snapshot_id` partitions. S3 retention is 30 days for
source snapshots, 7 days for Athena result files, and 1 day for Glue temp
files.

Each Athena query returns `metric_type`, nullable `society_id`, UTC
`period_start`, UTC inclusive `period_end`, and JSON-object `data`. The
adapter consumes paginated results and maps them to
`AnalyticsRepository.upsertMetric`; the four metric groups and API response
shape remain unchanged. See `ATHENA_GLUE_MIGRATION.md` for the SQL contract,
parity criteria, and cutover boundary.

## Cost saving vs classic EMR

|  | Classic EMR | EMR Serverless |
|---|---|---|
| Provisioning | Transient cluster 1× m5.large MASTER + 1× m5.large CORE (4 vCPU), `KeepJobFlowAliveWhenNoSteps=false`, ~5 min job + spin-up, `RunJobFlow`/`TerminateJobFlows`, `Ec2SubnetId`/`Ec2KeyName`, `ON_DEMAND` markup | `aws_emrserverless_application` `emr-7.2.0` `SPARK`, no instances/subnet, StartJobRun only |
| Billing | EC2 + EMR markup for full cluster lifetime, 4 vCPU reserved even while idle | Pay-per-second for Spark `vCPU/memory/disk` only while job runs (~3 vCPU); idle auto-stop 15m (`auto_stop_configuration.idle_timeout_minutes=15`), no baseline cost |
| Learner Lab fit | 2× m5.large consumes 4/32 vCPU and 2/9 instances simultaneously | ~3 vCPU max (`maximum_capacity { cpu="3 vCPU" memory="7 GB" disk="20 GB" }`), fits 32 vCPU/9 instance limit even with ECS `t3.micro` + RDS |
| Networking | Subnet + security group + termination complexity | No EC2 networking; Lambda polls EMR Serverless API only |
| IAM | LabRole reused | LabRole reused (`executionRoleArn` = LabRole, requires trust for `emr-serverless.amazonaws.com` – verified in `us-east-1` Learner Lab) |

No baseline proof is required; the migration is done directly for cost saving. PySpark script switches `s3a://` → `s3://` to use Serverless’ injected S3 connector, keeping `SparkSession.builder.getOrCreate()` and `argparse` flags unchanged.

## Ops

- Build: the Glue script is uploaded by OpenTofu; until ticket #8 removes the rollback path, `cd backend && pnpm build:analytics` also produces its three legacy Lambda zips.
- Deploy: `tofu plan/apply` with `enable_analytics_pipeline = true` (see `infras/terraform.tfvars.example`)
- Verify: trigger refresh via Admin Center Analytics tab or `POST /api/v1/admin/analytics/refresh` → check `GET /api/v1/admin/analytics`, Glue job history, and Athena query history.
- Teardown: `tofu destroy` (or disable flag); `End Lab` stops EC2 but not RDS/Serverless
