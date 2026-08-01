# RMIT Society — AWS deployment

AI-assisted school forum deployed to real AWS. Infrastructure uses direct, idempotent boto3 reconciliation; no CloudFormation/CDK, Docker Compose, MiniStack, or local AWS emulator.

## Architecture

- private S3 web origin + CloudFront HTTPS delivery
- same-origin CloudFront `/api/*` routing to FastAPI on EC2
- Cognito verified-email user pool and public SPA client
- DynamoDB single table with eight application GSIs
- private S3 media/analytics buckets
- EventBridge → FIFO SQS media routing, worker queues, and DLQs
- Lambda moderation/image/event consumers
- Comprehend and Rekognition moderation providers
- immutable ECR repositories
- ECS Fargate analytics task
- Glue catalog, Athena workgroup, and CloudWatch logs
- dedicated two-AZ VPC; EC2 port 8000 accepts only CloudFront origin traffic

## Prerequisites

- Python 3.12 and [uv](https://docs.astral.sh/uv/)
- Node.js and pnpm
- AWS CLI v2
- AWS IAM Identity Center profile or role with provisioning permissions
- immutable backend and worker images published by CI to provisioned ECR repositories

Never store AWS access keys, secret keys, or session tokens in `.env` or tracked files.

## 1. Authenticate and verify account

```sh
aws sso login --profile rmit-dev
AWS_PROFILE=rmit-dev aws sts get-caller-identity
```

Record returned 12-digit account ID. Production deployment requires explicit account confirmation.

## 2. Install and validate

```sh
cd backend
uv sync
uv run ruff check .
uv run mypy
uv run pytest

cd ../apps/web
pnpm install
pnpm lint
pnpm test
pnpm build
```

Backend can run directly on host for unit/UI development:

```sh
cd backend
uv run uvicorn rmit_society.server:app --reload --app-dir src --port 8000
```

Swagger UI: `http://localhost:8000/docs`. Host development uses mocks/test fixtures or explicitly configured AWS dev resources; it never redirects SDK calls to a local emulator.

## 3. Bootstrap AWS resources

Bootstrap creates shared resources and immutable ECR repositories, but does not launch application compute without release images.

```sh
AWS_PROFILE=rmit-dev \
AWS_ACCOUNT_ID=123456789012 \
make bootstrap STAGE=dev AWS_REGION=ap-southeast-2
```

Outputs are written to `.deploy/dev.json` (ignored by Git). Use `repositories.backend` and `repositories.worker` as CI image destinations. Tag images with release SHA/version; `latest` is rejected.

Production:

```sh
AWS_PROFILE=rmit-prod \
AWS_ACCOUNT_ID=123456789012 \
make bootstrap STAGE=prod AWS_REGION=ap-southeast-2
```

## 4. Build release artifacts

Build frontend with same-origin API default:

```sh
cd apps/web
pnpm build
cd ../..
```

Build and push these container definitions from a CI runner, not local deployment tooling:

- `backend/Dockerfile` → `repositories.backend:<release>`
- `backend/Dockerfile.worker` → `repositories.worker:<release>`

ECR repositories are immutable and retain 20 release images. IaC never invokes a local container runtime.

## 5. Deploy

```sh
AWS_PROFILE=rmit-dev \
AWS_ACCOUNT_ID=123456789012 \
BACKEND_IMAGE=123456789012.dkr.ecr.ap-southeast-2.amazonaws.com/rmit-society-dev-backend:<release> \
WORKER_IMAGE=123456789012.dkr.ecr.ap-southeast-2.amazonaws.com/rmit-society-dev-worker:<release> \
make deploy STAGE=dev AWS_REGION=ap-southeast-2
```

Full deployment:

1. reconciles foundational resources
2. registers ECS task definition with immutable worker image
3. reconciles Cognito
4. launches/reuses EC2 backend for immutable backend image
5. packages and updates SQS Lambda consumers
6. creates/updates CloudFront OAC and distribution
7. updates Cognito callback/logout URLs
8. uploads `apps/web/dist`
9. invalidates CloudFront cache

Final URL, Cognito IDs, resource names, and deployment status are in `.deploy/<stage>.json`.

## Configuration

`.env.example` contains placeholders only. AWS credentials use standard boto3 credential chain. Deployed runtime configuration is injected by IaC. Important optional variables:

- `CORS_ORIGINS` — host-development origins; deployed SPA uses same-origin routing
- `BACKEND_INSTANCE_TYPE` — defaults to `t3.micro`
- `OPENAPI_ENABLED` — disable public API docs in production if required

## Safety

- `prod` requires `--expected-account-id` / `AWS_ACCOUNT_ID`.
- Provisioning is rerunnable and non-destructive; no teardown command is provided.
- DynamoDB deletion protection and point-in-time recovery are enabled in production.
- Buckets remain private, encrypted, versioned, and blocked from public access.
- Moderation failures remain fail-closed in application workflows.
