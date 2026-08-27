# Analytics — EMR Serverless Pipeline

## Purpose (Analytics AWS category)

Assessment 3 requires an **Analytics**-category AWS service invoked automatically by application/UI code. The analytics pipeline satisfies this: a System Admin triggers `POST /api/v1/admin/analytics/refresh` (202 Accepted, `system_admin` only) or EventBridge cron `0 2 * * ? *` triggers the nightly run; S3 `_SUCCESS` chaining invokes the remaining stages automatically. Evidence is the UI action → Lambda → EMR Serverless → S3 → RDS metric upsert, plus CloudWatch logs and S3 `emr-serverless-logs`.

## Architecture

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
- **Gate:** `enable_analytics_pipeline` (default `false`) controls the application + 3 Lambdas + notifications + EventBridge; destroy after demo (`tofu destroy`) since `End Lab` does not stop Serverless apps.

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

- Build: `cd backend && pnpm build:analytics` (produces `analytics-dump-rds.zip`, `analytics-start-serverless.zip` (alias `analytics-start-emr.zip`), `analytics-load-results.zip`)
- Deploy: `tofu plan/apply` with `enable_analytics_pipeline = true` (see `infras/terraform.tfvars.example`)
- Verify: trigger refresh via Admin Center Analytics tab or `POST /api/v1/admin/analytics/refresh` → check `GET /api/v1/admin/analytics` and CloudWatch `/aws/lambda/*analytics*` (7-day retention)
- Teardown: `tofu destroy` (or disable flag); `End Lab` stops EC2 but not RDS/Serverless

