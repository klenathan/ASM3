# RMIT Society backend

FastAPI application packaged for a persistent ECS Fargate service. The AWS target uses
RDS PostgreSQL in isolated subnets and a private S3 media bucket. See the root
`README.md` for the deployment architecture and credential-injection flow.

## Host development

No local container or AWS emulator is required.

```sh
uv sync
uv run uvicorn rmit_society.server:app --reload --app-dir src --port 8000
```

Use moto-backed tests for AWS adapters. For explicit integration testing, configure isolated `dev` AWS resources from `.deploy/dev.json`; never use production resources or paid moderation calls from automated tests.

## Package layout

- `rmit_society/api.py` — ASGI factory, CORS, domain-error handlers
- `rmit_society/server.py` — combined app under `/api/v1`
- `rmit_society/aws.py` — boto3 clients using standard AWS credential chain
- `rmit_society/config.py` — Pydantic runtime configuration
- `rmit_society/auth/` — Cognito JWT verification and authorization dependencies
- `rmit_society/domain/` — Pydantic entities and enums
- `rmit_society/repositories/` — protocols, the SQLAlchemy PostgreSQL adapter (`postgres.py`), the legacy DynamoDB adapter, and a driver factory (`factory.py`)
- `alembic/` — schema migrations for the PostgreSQL (RDS) persistence layer
- `rmit_society/services/` — application/domain services
- `rmit_society/providers/` — Comprehend, Rekognition, SQS, and S3 adapters
- `rmit_society/handlers/` — FastAPI routers
- `rmit_society/workers/` — Lambda consumers and ECS analytics worker

## Entrypoints

- EC2 server image: `backend/Dockerfile`
- Lambda consumers: `rmit_society.workers.lambda_handlers.{moderation_handler,image_handler,event_handler}`
- ECS worker image: `backend/Dockerfile.worker`
- ECS worker command: `python -m rmit_society.workers.analytics`

Container images are built by CI and supplied to boto3 IaC as immutable ECR release URIs. Provisioning does not build images.

## Checks

```sh
uv run ruff check .
uv run mypy
uv run pytest
```
