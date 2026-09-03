# AWS infrastructure

OpenTofu provisions a low-cost demo environment in AWS:

- AWS Amplify hosts the React client and rewrites its `/api/*` requests to API Gateway.
- API Gateway proxies API requests to the backend container on one ECS service and one EC2 container instance.
- S3 stores public media objects.
- RDS PostgreSQL is Single-AZ and private across two database subnets.
- Secrets Manager injects `DATABASE_URL`; ECR stores backend images.
- Optional content analysis runs in AWS Lambda and calls the configured DeepSeek
  model through OpenRouter over HTTPS. Its API key is read from Secrets Manager.
- Moderator-triggered re-analysis is accepted by the API, placed on a dedicated
  SQS queue, and processed by a long-polling worker in the existing ECS backend
  task before it invokes Lambda.
- CloudWatch keeps application logs for 7 days and SSM provides shell access without SSH.
- An ad hoc ECS task applies committed migrations and idempotently seeds initial data before the API service starts.

The design deliberately omits a directly managed CloudFront distribution, NAT Gateway, load balancers, Fargate, Multi-AZ RDS, and paid container insights. Learner Lab uses its pre-created `LabRole` and `LabInstanceProfile`. Amplify's generated `https://*.amplifyapp.com` site hosts the SPA and proxies `/api/*` to API Gateway, keeping session cookies first-party. API Gateway then routes those requests to the backend. This is a coursework-only setup: the EC2 backend port remains public because HTTP API Gateway has no stable source CIDR, and public media still uses an S3 policy. The application remains the authorization boundary. Add an NLB with an API Gateway VPC Link before using this beyond coursework/demo scope.

## Prerequisites

- OpenTofu 1.9 or newer
- AWS CLI authenticated with SSO or a named profile
- AWS Academy Learner Lab with pre-created `LabRole` and `LabInstanceProfile`
- Docker for building the backend image
- pnpm, zip, and curl for publishing the frontend artifact

Never put AWS keys, database passwords, OpenRouter API keys, or other secrets in
`.tfvars` or source control.

## 1. Create remote state

The bootstrap stack stays in local state and creates an encrypted, versioned S3 bucket. Noncurrent state versions expire after 90 days; keep its local state secure. Use the same region in both stacks. The supplied configuration uses US East (N. Virginia) (`us-east-1`).

```sh
cd infras/bootstrap
cp terraform.tfvars.example terraform.tfvars
tofu init
tofu apply
```

Record the `state_bucket_name` output. The root stack uses S3's native conditional lockfile, so no DynamoDB lock table is needed.

## 2. Initialize and deploy

```sh
cd ..
cp terraform.tfvars.example terraform.tfvars
tofu init \
  -backend-config="bucket=STATE_BUCKET_NAME" \
  -backend-config="key=demo/infrastructure.tfstate" \
  -backend-config="region=us-east-1"
tofu plan -out=deployment.tfplan
tofu apply deployment.tfplan
```

The initial `app_desired_count = 0` is intentional because the backend ECR repository is empty. It does not stop EC2, RDS, EIP, Amplify, and storage charges; destroy the root stack whenever the demo is not in active use. The Amplify site proxies API requests through its own origin, so session cookies remain first-party.

The bootstrap migration command performs a narrow preflight for migration 0013:
when the legacy nullable platform index is still absent, it retains the newest
row for each `(metric_type, period_start)` platform key before Drizzle creates
the generated unique index. This makes the index safe for existing valid
historical data without editing generated migration SQL.

## 3. Publish application artifacts

Build and publish the frontend artifact to the Amplify production branch:

```sh
./scripts/deploy-frontend.sh
# or
make deploy-frontend
```

The script sources an optional root `.env`, builds `web/`, then creates and starts
an Amplify deployment using a signed archive upload. It sets `VITE_API_URL` to the
Amplify site origin so API requests use Amplify's `/api/*` rewrite rule.

Build and push the backend runtime image from an authenticated development machine. The image downloads AWS's global RDS CA bundle at build time and keeps PostgreSQL certificate verification enabled; rebuild after AWS publishes a required CA update. The script always publishes under the `latest` tag (which the ECS task definition references) and then force-deploys the ECS service so the running backend picks up the new image immediately:

```sh
./scripts/push-backend-ecr.sh
# or
make push-backend
```

The script uses `linux/amd64` by default because the Learner Lab ECS instance uses
an x86 `t3.micro`. It cross-builds correctly on Apple Silicon. Override only when
deployment infrastructure is ARM-based:

```sh
TARGET_PLATFORM=linux/arm64 ./scripts/push-backend-ecr.sh
```

The backend GitHub Actions workflow builds pull requests. Learner Lab blocks
creation of GitHub OIDC providers and roles, so image publishing stays manual.

Before starting the API service, run the one-shot database task. It builds the `database-bootstrap` Docker target, pushes the exact image tag referenced by the current OpenTofu task definition, waits for it to complete, and returns a failure exit code if either the migration or seed step fails. The seed is idempotent, so rerunning it is safe.

```sh
make migrate-seed
```

Inspect a failed run in the CloudWatch log group reported by the command, or retrieve it with:

```sh
tofu output -raw database_bootstrap_log_group_name
```

Set `app_desired_count = 1` in the ignored `terraform.tfvars`, then run `tofu plan` and `tofu apply`. For later same-tag deployments, force ECS to pull the new images:

```sh
aws ecs update-service \
  --cluster "$(tofu output -raw ecs_cluster_name)" \
  --service "$(tofu output -raw ecs_service_name)" \
  --force-new-deployment
```

Use immutable image tags in repeatable CI deployments rather than `latest`.

### Optional OpenRouter content analysis

Build the Lambda artifact before enabling the feature:

```sh
cd backend
pnpm build:content-analysis
cd ../infras
tofu plan
tofu apply
```

When the Lambda is enabled, retrieve the secret ARN and store the OpenRouter
API key without putting it in Terraform state:

```sh
SECRET_ARN="$(tofu output -raw openrouter_api_key_secret_arn)"
aws secretsmanager put-secret-value \
  --secret-id "$SECRET_ARN" \
  --secret-string 'YOUR_OPENROUTER_API_KEY'
```

Set `content_analysis_openrouter_model` to the approved OpenRouter DeepSeek
model slug and use `content_analysis_mode = "shadow"` for the first rollout.
The selected model must support image input while image analysis is enabled.
Keep the Lambda outside the VPC so it has outbound HTTPS access without a NAT
Gateway. The active Learner Lab `LabRole` must allow the function to read the
secret, read approved S3 media, and write CloudWatch logs.

### Analytics — Glue + Athena (gated)

The analytics pipeline is the **Analytics-category AWS service** required by
Assessment 3. It is fully gated by `enable_analytics_pipeline` (default
`false`, costs nothing when disabled).

The final path serves the action-event administrator dashboard:

```text
POST /api/v2/admin/analytics/refresh (system_admin, 202 Accepted)
  -> ECS creates durable refresh run
  -> Standard Step Functions workflow
  -> AWS Glue exports action_events, memberships, and votes
  -> private analytics S3 bucket (partitioned Parquet + manifest)
  -> three Athena metric queries in parallel
  -> analytics workflow Lambda validates and persists action metrics
  -> GET /api/v2/admin/analytics
```

EventBridge invokes the authenticated
`/api/v2/admin/analytics/scheduled-refresh` API destination at
`cron(0 2 * * ? *)` UTC. The ECS backend does not poll Glue or Athena.
Step Functions owns waiting, retries, timeout handling, and fan-in. The
workflow Lambda runs in the database subnets and uses VPC interface endpoints
for Athena, Secrets Manager, and CloudWatch Logs. ECS is also allowed HTTPS
ingress to those endpoints because ECS task secret injection and `awslogs`
delivery resolve the same private endpoint DNS names.

Scheduler delivery retries for one hour and sends exhausted events to the
analytics scheduler SQS DLQ. Before enabling the pipeline, verify the active
Learner Lab `LabRole` trust for `events.amazonaws.com`, `glue.amazonaws.com`,
`states.amazonaws.com`, and `lambda.amazonaws.com`, plus effective Glue,
Athena, S3, Secrets Manager, Step Functions, Lambda, EventBridge, SQS, and RDS
permissions. Set `analytics_learner_lab_permissions_confirmed = true`;
OpenTofu otherwise fails closed. No custom IAM role is created.

The checked-in Learner Lab service list currently does not confirm Step
Functions availability. Do not treat `tofu validate` as proof that the active
lab can create this state machine: verify the lab Resources/Service Access
list and `LabRole` trust before `tofu apply`. If either is unavailable, keep
the analytics gate disabled rather than silently substituting another
orchestrator.

OpenTofu manages the Glue connection/job, Glue Catalog database and tables,
Athena workgroup, Step Functions state machine, workflow Lambda, Lambda
interface endpoints, S3 lifecycle rules, scheduled EventBridge rule, API
destination, and the shared private S3 bucket. All analytics resources are
gated by `enable_analytics_pipeline` and reuse the pre-created `LabRole`; no
IAM roles are created. Source snapshots and manifests expire after 30 days,
Athena results after 7 days, and Glue temporary files after 1 day. Destroy
after a demo (`tofu destroy`); `End Lab` does not stop RDS or remove retained
S3 objects unless force destroy is set.

Build the workflow Lambda before planning. The build packages the AWS RDS global
CA bundle alongside the handler; do not upload a zip produced by another
process without that file.

```sh
cd ../backend
pnpm install --frozen-lockfile
pnpm build:analytics-workflow
cd ../infras
tofu plan
tofu apply
```

For a code-only workflow Lambda rollout after the function already exists, use
the dedicated publisher. It rebuilds the bundle, uploads it to the function,
and waits for `$LATEST` to become available before returning:

```sh
cd ..
./scripts/push-analytics-lambda.sh
# or
make push-analytics-lambda
```

Use `GET /api/v2/admin/analytics` and the Admin Center Analytics tab to verify
action metrics, Glue job completion, and Athena query history. Confirm the
three action metric queries pass the checks in
`docs/analytics/ATHENA_GLUE_MIGRATION.md` before enabling infrastructure.
After cutover, rollback is explicit and manual: restore the prior Git revision
and reapply it. The shared S3 bucket is retained across the cutover so action
analytics data can be inspected or removed by the normal teardown process.
### Troubleshoot `voc-cancel-cred` upload failures

An S3 error naming `assumed-role/voclabs/user...` and the
`voc-cancel-cred` policy means the upload URL was signed with interactive
Learner Lab credentials that Vocareum has explicitly denied. Bucket policy
changes cannot override that deny.

1. Start/resume the Learner Lab and wait until AWS access is green.
2. Refresh local temporary credentials if using AWS CLI deployment scripts.
3. Restart any local API process after refreshing credentials; existing signed
   upload URLs retain the cancelled signer and must be requested again.
4. For the deployed app, apply the current task definition and force a new ECS
   deployment. The task definition assigns `LabRole` as `task_role_arn`; do not
   inject `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, or `AWS_SESSION_TOKEN`
   into the ECS container.

Confirm the active task definition before retrying:

```sh
aws ecs describe-task-definition \
  --task-definition "$(aws ecs describe-services \
    --cluster "$(tofu output -raw ecs_cluster_name)" \
    --services "$(tofu output -raw ecs_service_name)" \
    --query 'services[0].taskDefinition' --output text)" \
  --query 'taskDefinition.taskRoleArn' --output text
```

Expected suffix: `role/LabRole`. If access remains denied while the lab is
active, stop changing bucket policies and contact course/lab support; only
Vocareum can remove an identity-policy explicit deny.

## Optional custom domain

The generated API Gateway URL is already HTTPS. For a branded domain, request or import an ACM certificate in the same region as this stack, then set both `api_custom_domain_name` and `api_custom_domain_certificate_arn`. After apply, create a CNAME at your DNS provider using `api_custom_domain_target`, or a Route 53 alias using that target and `api_custom_domain_hosted_zone_id`. API Gateway custom domains support TLS 1.2.

## Teardown

Empty the content buckets first, or set `force_destroy_buckets = true` for the final apply, then destroy the root stack. This releases the EC2 instance, public IPv4 address, RDS instance, and other recurring-cost resources:

```sh
tofu plan -destroy -out=destroy.tfplan
tofu apply destroy.tfplan
```

The state bucket has `prevent_destroy`. After the root stack is gone, remove old state object versions and delete the bucket manually only when the project no longer needs recovery or audit history.
