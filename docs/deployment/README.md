# Deployment and operations guide

This guide deploys RMIT Society into the AWS Academy Learner Lab in `us-east-1`. It is the operational source of truth; [`infras/README.md`](../../infras/README.md) explains the OpenTofu stack and [`README.md`](../../README.md) gives the local-development path.

## What the deployment creates

The root OpenTofu stack creates the deployment resources below. It uses the Learner Lab-provided `LabRole` and `LabInstanceProfile`; it does not manage application IAM users, custom roles, or credentials.

| Category | Services | Purpose |
| --- | --- | --- |
| Compute and containers | EC2, ECS, ECR | Runs and publishes the Node.js API container. |
| Storage | S3 | Stores uploaded media; optional analytics exports use a separate private bucket. |
| Networking and delivery | Amplify Hosting, API Gateway | Serves the React SPA and routes its `/api/*` requests to the API. |
| Database | RDS PostgreSQL, Secrets Manager | Persists product data; injects the database connection string into the task. |
| Optional content analysis | SQS, Lambda, Secrets Manager | Processes moderator-requested re-analysis through OpenRouter. |
| Optional analytics | EventBridge, Step Functions, Glue, S3, Athena, Lambda, SQS | Materializes administrator action metrics. |

The initial configuration has `app_desired_count = 0`. This prevents an ECS task from starting before a backend image and migrated database exist. It does **not** prevent charges for the EC2 instance, RDS, public IPv4 address, Amplify, or retained storage.

## Before you begin

### 1. Confirm the Learner Lab

In the active lab, confirm that:

1. The region is `us-east-1`.
2. `LabRole` and `LabInstanceProfile` exist and are usable.
3. The account permits the selected services. Analytics additionally needs Glue, Athena, Step Functions, Lambda, EventBridge, SQS, Secrets Manager, S3, and RDS access.
4. The lab session is active and its credentials are current.

Do not silently substitute an unavailable service. Keep its feature gate off, record the restriction, and obtain approval for an alternative.

### 2. Install local tools

Install:

- Node.js 22, Corepack, and pnpm 10;
- Docker Desktop with Buildx;
- AWS CLI;
- OpenTofu 1.9 or newer;
- `curl`, `zip`, and `unzip`.

On Apple Silicon, Docker cross-builds the default `linux/amd64` image because the supplied ECS EC2 instance is x86. Keep the default unless the infrastructure is intentionally changed to ARM.

### 3. Configure local AWS access

At the repository root, copy the non-secret template and configure **one** authentication method: either an AWS profile or the current temporary credentials supplied by the lab.

```sh
cp .env.example .env
```

Set `AWS_REGION="us-east-1"`. Set `AWS_PROFILE` when using a configured profile, or uncomment and fill the temporary credential variables while the Learner Lab session is active. Do not use both forms. Keep `.env` local.

Verify the selected identity before creating resources:

```sh
make whoami
```

Do not paste the command output into documentation, issues, or commits because it identifies the AWS account.

### 4. Configure OpenTofu variables

```sh
cp infras/terraform.tfvars.example infras/terraform.tfvars
```

Edit the ignored `infras/terraform.tfvars`:

- Set `owner` to the student identifier used for resource tags.
- Keep `aws_region = "us-east-1"`, unless the active lab explicitly requires a different permitted region.
- Keep `app_desired_count = 0` for the first apply.
- Keep `force_destroy_buckets = false` except for a deliberate final teardown.
- Leave `enable_content_analysis_lambda` and `enable_analytics_pipeline` disabled unless their prerequisites below are met.

Never put an API key, database password, credential, or access token in this file. Secrets are created as AWS Secrets Manager placeholders and populated after OpenTofu apply.

## Initial deployment

Run these commands from the repository root. The Makefile loads `.env` for targets that need AWS credentials.

### 1. Bootstrap remote state

The bootstrap stack uses local state and creates the encrypted, versioned S3 bucket used by the root stack's remote state. Protect that local bootstrap state.

```sh
cp infras/bootstrap/terraform.tfvars.example infras/bootstrap/terraform.tfvars
make bootstrap-init
make bootstrap-plan
make bootstrap-apply
make bootstrap-output
```

Copy `state_bucket_name` into `STATE_BUCKET` in root `.env`, then initialize the root stack:

```sh
make init
```

### 2. Provision the application stack

Review the plan before applying it. The first apply creates the ECR repository, ECS cluster, RDS database, API Gateway, Amplify application, and supporting resources, but leaves the API service at zero desired tasks.

```sh
make plan
make apply
```

Record the public endpoints for deployment and demonstration notes:

```sh
make output
```

The important outputs are `site_url`, `api_url`, `ecs_cluster_name`, `ecs_service_name`, and `database_bootstrap_log_group_name`.

### 3. Migrate and seed the database

The one-shot ECS task builds the `database-bootstrap` image tag expected by the active task definition, pushes it to ECR, applies committed migrations, and runs the idempotent deterministic seed.

```sh
make migrate-seed
```

Do not continue when this command fails. Inspect the CloudWatch log group named by `database_bootstrap_log_group_name`, correct the failure, and run the same command again.

### 4. Start the API service

Change `app_desired_count` to `1` in `infras/terraform.tfvars`, review the plan, and apply it.

```sh
make plan
make apply
```

### 5. Publish the backend and web client

```sh
make push-backend
make deploy-frontend
```

`make push-backend` publishes `backend/Dockerfile`'s runtime target as ECR tag `latest` and forces a new ECS deployment only when the service desired count is nonzero. `make deploy-frontend` builds the Vite app with `VITE_API_URL` set to the Amplify site origin, then uploads the generated archive to the configured Amplify branch. This keeps browser API requests on the same origin through Amplify's `/api/*` rewrite.

## Verify the live deployment

1. Run `make output` and open `site_url`.
2. Use a browser to create a session and exercise a read/write workflow; confirm the client can call `/api/*` without a cross-origin configuration change.
3. Check the backend liveness route through the published API origin:

   ```sh
   curl "$(tofu -chdir=infras output -raw api_url)/api/v1/health/live"
   ```

4. Confirm the ECS service has a running task and its deployment is stable in AWS.
5. Confirm the seeded demo data is visible. Seed accounts are development/demo credentials only; never publish them as real-user accounts.
6. Upload media and verify the resulting S3-backed object path when demonstrating storage.

For a backend code update, run `make push-backend`. For a frontend-only update, run `make deploy-frontend`. For schema or seed changes, run `make migrate-seed` before deploying code that requires them.

`make cd` is a repeat-deployment convenience command. It applies infrastructure with `-auto-approve`, runs database bootstrap, pushes the backend, and publishes the frontend. Do not use it for an initial deployment, a destructive change, or an unreviewed plan.

## Optional feature setup

### Content analysis

Do not enable this feature until the current lab permits Lambda and `LabRole` can assume it and read the OpenRouter secret. Build the Lambda artifact first:

```sh
cd backend
pnpm install --frozen-lockfile
pnpm build:content-analysis
cd ..
```

In `infras/terraform.tfvars`, set the approved model slug, enable the Lambda, and begin in `shadow` mode:

```hcl
enable_content_analysis_lambda    = true
content_analysis_mode             = "shadow"
content_analysis_openrouter_model = "deepseek/<approved-model-slug>"
```

Apply the reviewed plan, then set the reported `openrouter_api_key_secret_arn` value in AWS Secrets Manager. Do not put the OpenRouter key in source files, `.env`, or `.tfvars`. Use [`docs/content-analysis/`](../content-analysis/) for operational and queue behavior.

### Analytics

Analytics is disabled by default and must remain disabled if Step Functions or the required `LabRole` trust relationships are unavailable. The administrator action path is:

```text
Admin Center / scheduled EventBridge request
  → durable refresh run in ECS API
  → Standard Step Functions workflow
  → Glue export to private S3
  → three Athena queries
  → workflow Lambda persists metrics in RDS
```

Before enabling it:

1. Confirm the active lab allows the listed analytics services and that `LabRole` trusts `events.amazonaws.com`, `glue.amazonaws.com`, `states.amazonaws.com`, and `lambda.amazonaws.com`.
2. Build the workflow Lambda:

   ```sh
   cd backend
   pnpm install --frozen-lockfile
   pnpm build:analytics-workflow
   cd ..
   ```

3. Set both gates in `infras/terraform.tfvars`:

   ```hcl
   enable_analytics_pipeline                  = true
   analytics_learner_lab_permissions_confirmed = true
   ```

4. Review and apply the OpenTofu plan.
5. Request a bounded administrator refresh, then verify the durable run, Glue manifest, all three Athena queries, workflow Lambda persistence, and the Admin Center result. Do not start a workflow with empty input and do not claim the feature is deployed from `tofu validate` alone.

See [the analytics guide](../analytics/README.md) and [Athena/Glue migration checks](../analytics/ATHENA_GLUE_MIGRATION.md) for the data contract and end-to-end verification.

## Cost control and teardown

For a short pause, set `app_desired_count = 0` and apply it. This stops the ECS service but leaves most billable resources in place. Disable the analytics schedule before a prolonged pause if analytics is enabled.

After a demonstration, destroy the root stack to release recurring resources. Empty content buckets first, or deliberately set `force_destroy_buckets = true` for the final apply.

```sh
make destroy
```

The bootstrap state bucket is protected with `prevent_destroy`. Delete its retained state versions and the bucket manually only when the project no longer needs recovery or audit history. Ending the Learner Lab does not reliably remove RDS, storage, or other billable resources; verify the destroy operation instead.
