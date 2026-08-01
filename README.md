# RMIT Society AWS Deployment

RMIT Society is deployed as a three-tier application using direct, idempotent boto3
reconciliation. The scripts use the normal AWS credential chain and do not use
CloudFormation, CDK, Terraform, or a local AWS emulator.

## Architecture

```text
Users
  |
  v
AWS Amplify Hosting (React SPA)
  |  /api/* same-origin reverse proxy
  v
CloudFront (AWS-managed HTTPS hostname, API caching disabled)
  |
  v
Public ALB (two public subnets)
  |
  v
ECS Fargate FastAPI service (two private application subnets)
  |
  v
RDS PostgreSQL (two isolated database subnets)

Fargate -> private S3 media bucket
Fargate -> Secrets Manager-managed RDS credentials
Fargate -> NAT gateway -> ECR/AWS APIs
```

The dedicated VPC spans two Availability Zones. Security groups allow only the
AWS-managed CloudFront origin-facing prefix list to reach the ALB, ALB traffic to
Fargate on port 8000, and Fargate traffic to PostgreSQL on port 5432. This prevents
direct HTTP bypass of CloudFront. RDS has no public address or internet route. S3
blocks all public access and uses encryption, versioning, and incomplete-upload cleanup.

RDS uses the newest PostgreSQL engine version currently available in the selected AWS
region when the database is first created. Existing databases keep their selected
version so a rerun cannot silently perform a major-version upgrade. AWS generates the
database password and stores it in Secrets Manager; deployment output contains only the
secret ARN, never the password.

CloudFront is used only to give the ALB API an AWS-provided HTTPS endpoint without
requiring a custom domain or ACM certificate. Amplify rewrites `/api/*` to that endpoint,
so the frontend continues to use its default same-origin `/api/v1` base URL.

## Prerequisites

- Python 3.12 and [uv](https://docs.astral.sh/uv/)
- Node.js and pnpm
- AWS CLI v2
- An AWS IAM Identity Center profile or attached provisioning role
- Docker or another OCI builder for producing the backend image

Never put AWS keys, database passwords, or session tokens in `.env` or tracked files.

## Validate Locally

The backend reads `DATABASE_DRIVER` (default `postgres`). Host development can point
the SQLAlchemy `DATABASE_URL` at a local Postgres or at RDS through a tunnel. For a
quick local run without Postgres, set `DATABASE_DRIVER=dynamodb` (legacy) or run a
local PostgreSQL via Docker:

```sh
docker run -d --name rmit-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=rmit_society -p 5432:5432 postgres:16
DATABASE_DRIVER=postgres DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/rmit_society make db-migrate
```

```sh
cd backend
uv sync
uv run ruff check . ../infra/deploy.py
uv run mypy
uv run pytest

cd ../apps/web
pnpm install
pnpm lint
pnpm test
pnpm build
```

Standalone database migrations are managed with Alembic:

```sh
cd backend
uv run alembic upgrade head          # apply to the configured DATABASE_URL
uv run alembic revision --autogenerate -m "describe change"   # new revision
```

## Bootstrap AWS

Authenticate and confirm the target account before provisioning:

```sh
aws sso login --profile rmit-dev
AWS_PROFILE=rmit-dev aws sts get-caller-identity

AWS_PROFILE=rmit-dev \
AWS_ACCOUNT_ID=123456789012 \
make bootstrap STAGE=dev AWS_REGION=ap-southeast-2
```

Bootstrap creates or reconciles the VPC, subnets, routes, one NAT gateway, security
groups, private S3 bucket, ECR repository, RDS instance and managed secret, ECS IAM
roles, and Amplify app/branch. RDS and NAT incur charges as soon as they are created.
Provisioning RDS can take 10-20 minutes.

Outputs are written to `.deploy/dev.json`, which is ignored by Git. Use
`repository_uri` as the destination for the backend image.

Production requires a separate profile/account confirmation:

```sh
AWS_PROFILE=rmit-prod \
AWS_ACCOUNT_ID=123456789012 \
make bootstrap STAGE=prod AWS_REGION=ap-southeast-2
```

Production enables Multi-AZ RDS, deletion protection, Performance Insights, and two
Fargate tasks. Development uses one Fargate task and a single-AZ RDS instance to limit
cost. Both stages place the database subnets in two Availability Zones.

## Build And Push

Use an immutable release tag, not `latest`:

```sh
REPOSITORY=123456789012.dkr.ecr.ap-southeast-2.amazonaws.com/rmit-society-dev-backend
RELEASE=release-$(git rev-parse --short HEAD)

aws ecr get-login-password --region ap-southeast-2 --profile rmit-dev | \
  docker login --username AWS --password-stdin 123456789012.dkr.ecr.ap-southeast-2.amazonaws.com
docker build -t "$REPOSITORY:$RELEASE" backend
docker push "$REPOSITORY:$RELEASE"

cd apps/web
pnpm build
cd ../..
```

## Deploy

```sh
AWS_PROFILE=rmit-dev \
AWS_ACCOUNT_ID=123456789012 \
BACKEND_IMAGE=123456789012.dkr.ecr.ap-southeast-2.amazonaws.com/rmit-society-dev-backend:release-abc123 \
make deploy STAGE=dev AWS_REGION=ap-southeast-2
```

Deployment registers a Fargate task definition, creates or updates the ECS service,
ALB, target group, API CloudFront distribution, and Amplify API proxy, then uploads
`apps/web/dist` through Amplify's manual deployment API. The final frontend and API
URLs are in `.deploy/<stage>.json`.

The command is non-destructive and has no teardown path. It validates the authenticated
AWS account and rejects `latest` or images from a different ECR repository.

## Configuration

- `STAGE`: `dev` or `prod`
- `AWS_REGION`: defaults to `ap-southeast-2`
- `AWS_PROFILE`: standard boto3 profile selection
- `AWS_ACCOUNT_ID`: required deployment safety check
- `BACKEND_IMAGE`: immutable ECR release tag or digest, required by `make deploy`
- `RDS_INSTANCE_CLASS`: defaults to `db.t4g.micro`
- `RDS_ENGINE_VERSION`: optional initial PostgreSQL version override
- `WEB_DIST`: defaults to `apps/web/dist`

Runtime resource values are injected into the ECS task definition. ECS reads the
`username` and `password` fields from the RDS-managed secret through the execution role.
The container URL-encodes them and constructs `DATABASE_URL` in memory before importing
FastAPI; plaintext credentials never appear in task definitions or deployment outputs.
