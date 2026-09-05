# AWS infrastructure

OpenTofu provisions the coursework deployment for RMIT Society in the AWS Academy Learner Lab. The deployment uses the pre-created `LabRole` and `LabInstanceProfile` and is designed for a low-cost, single-environment demonstration in `us-east-1`.

The complete setup, deployment order, live verification, optional-feature gates, and teardown procedure are in the [deployment and operations guide](../docs/deployment/README.md). Follow that guide for an initial deployment; this file describes the stack contract.

## Architecture

```text
Amplify Hosting
  └─ /api/* rewrite → API Gateway → ECS service on one EC2 instance → RDS PostgreSQL
                                         ├─ ECR runtime image
                                         ├─ S3 media
                                         └─ SQS re-analysis queue → Lambda → OpenRouter

Optional analytics:
Admin Center / EventBridge → ECS API → Step Functions → Glue → private S3/Athena → Lambda → RDS
```

| Area | Resources and responsibility |
| --- | --- |
| Web and API | Amplify hosts the Vite SPA. API Gateway proxies application API requests to ECS. |
| Runtime | ECS runs the backend on a single EC2 container instance; ECR stores the backend and bootstrap images. |
| Data | RDS PostgreSQL is Single-AZ in private database subnets. Secrets Manager supplies `DATABASE_URL`. |
| Media | A public S3 bucket stores uploaded media; only metadata/object keys live in RDS. |
| Operations | CloudWatch retains logs for seven days; SSM provides shell access without SSH. |
| Database bootstrap | A one-shot ECS task runs committed migrations and the idempotent deterministic seed. |
| Content analysis | When enabled, SQS delivers moderator-requested re-analysis to the existing ECS worker, which invokes Lambda. |
| Analytics | When enabled, EventBridge invokes the authenticated scheduler route; Step Functions coordinates Glue, Athena, and the workflow Lambda. |

This is coursework infrastructure, not a production perimeter. The backend port remains publicly reachable because HTTP API Gateway has no stable source CIDR. Application authorization remains the boundary. A production design should use an NLB and API Gateway VPC Link, private media access, stronger network isolation, and production operational controls.

## Stack layout

- `bootstrap/` creates the encrypted, versioned S3 state bucket. It intentionally uses local state.
- Root `*.tf` files create application infrastructure and use the bootstrap bucket for remote state with S3's conditional lockfile.
- `terraform.tfvars.example` documents safe defaults and feature gates. Copy it to ignored `terraform.tfvars`; never put secrets in it.
- `outputs.tf` exposes deployment endpoints, resource names, bootstrap task details, and secret ARNs needed by publishing scripts.

## Required configuration

At the repository root, configure AWS access in `.env` from [`.env.example`](../.env.example). Use either `AWS_PROFILE` or temporary lab credentials; never commit them. Copy `terraform.tfvars.example` to `terraform.tfvars` and set `owner` and the initial `app_desired_count = 0`.

The root stack needs the bootstrap output as `STATE_BUCKET` in root `.env`. Initialize it through the Makefile:

```sh
make bootstrap-init
make bootstrap-apply
make bootstrap-output
# Set STATE_BUCKET to state_bucket_name in ../.env.
make init
```

Use `make plan` before `make apply`. The Makefile always loads root `.env` for AWS/OpenTofu targets.

## Application publishing contract

Infrastructure must exist before the scripts below can read their OpenTofu outputs:

| Command | Contract |
| --- | --- |
| `make migrate-seed` | Builds the database-bootstrap Docker target, pushes the exact tag in the current task definition, waits for the one-shot task, and fails if migrations or seed fail. |
| `make push-backend` | Builds/pushes the runtime target as ECR tag `latest`; force-deploys ECS only when desired count is nonzero. |
| `make deploy-frontend` | Builds `web/` with the Amplify site origin, creates a signed Amplify deployment, uploads the ZIP, and starts the deployment. |
| `make push-content-analysis` | Builds and updates the content-analysis Lambda bundle after that feature has been provisioned. |
| `make push-analytics-lambda` | Builds and updates the analytics workflow Lambda after that feature has been provisioned. |

The required first-deployment order is: apply with zero ECS tasks → `make migrate-seed` → set `app_desired_count = 1` and apply → publish backend → publish frontend. Do not start traffic before the bootstrap task succeeds.

## Feature gates

### Content analysis

`enable_content_analysis_lambda` defaults to false. Build `backend/dist-function/content-analysis.zip`, confirm active Learner Lab Lambda permissions and `LabRole` access, provision the feature, then populate the resulting `openrouter_api_key_secret_arn` in Secrets Manager. Start with `content_analysis_mode = "shadow"`; never expose the OpenRouter key through OpenTofu variables or the repository.

### Analytics

`enable_analytics_pipeline` defaults to false. It can be enabled only when the active lab supports Step Functions, Glue, Athena, Lambda, EventBridge, SQS, Secrets Manager, S3, and RDS, and the pre-created `LabRole` trusts all required service principals. Set `analytics_learner_lab_permissions_confirmed = true` only after that verification. Build `backend/dist-function/analytics-workflow.zip` before planning.

The backend creates a durable, range-scoped refresh run; it must never start a Step Functions execution with empty input. Step Functions owns Glue/Athena waiting and fan-in. See [the analytics guide](../docs/analytics/README.md) for the data contract and verification steps.

## Outputs and troubleshooting

Run `make output` after apply. Common outputs are:

- `site_url` and `api_url` for browser and health checks;
- `ecs_cluster_name` and `ecs_service_name` for service inspection;
- `database_bootstrap_log_group_name` for failed migration/seed task logs;
- `database_url_secret_arn` and optional `openrouter_api_key_secret_arn` for secrets;
- media, queue, and analytics scheduler DLQ outputs for feature operation.

If S3 reports a `voc-cancel-cred` deny, the Learner Lab identity that signed the request is cancelled. Refresh the lab session and local credentials, restart any local API that minted presigned URLs, and force a new ECS task only after verifying it uses `LabRole`. Bucket-policy changes cannot override an identity-policy explicit deny.

## Teardown

Set `app_desired_count = 0` only for a short pause; EC2, RDS, storage, public IPv4, and other resources can still incur cost. For final teardown, empty buckets or deliberately set `force_destroy_buckets = true`, then run:

```sh
make destroy
```

The bootstrap state bucket has `prevent_destroy`. Remove it manually only after all root resources and the need for state recovery/audit have ended.
