# RMIT Society backend

The backend is a single FastAPI application (`rmit_society.server:app`) that runs
as a persistent server — an EC2 instance in dev/prod, or plain uvicorn locally —
rather than as per-domain Lambda functions.

From the repository root, provision MiniStack and load host-local AWS settings
before starting Uvicorn:

```sh
make deploy-local
set -a
source .env 2>/dev/null || source .env.example
set +a
cd backend
uv sync
uv run uvicorn rmit_society.server:app --app-dir src --port 8000
```

The API mounts all domain routers under `/api/v1` and exposes `/api/v1/health`.
`rmit_society.local:app` remains as a backward-compatible alias for that app.

SQS consumers (moderation, image, event) still deploy as Lambda functions
(`rmit_society.workers.lambda_handlers.*`) triggered by event-source mappings;
they may move onto the EC2 backend container later.

## Package layout

- `rmit_society/api.py` — ASGI app factory with narrow CORS and domain-error handlers
- `rmit_society/server.py` — canonical combined app (all routers under `/api/v1`)
- `rmit_society/aws.py` — centralized boto3 client/resource through `AWS_ENDPOINT_URL`
- `rmit_society/config.py` — pydantic-settings configuration
- `rmit_society/base.py` — UTC timestamps, opaque IDs, tamper-resistant cursor codec
- `rmit_society/auth/` — Cognito/local JWT verification, role claims, FastAPI dependencies
- `rmit_society/domain/` — Pydantic entities and enums
- `rmit_society/repositories/` — repository protocols and DynamoDB single-table adapter
- `rmit_society/services/` — identity, societies, content, feeds, engagement, moderation, media, analytics
- `rmit_society/providers/` — Comprehend, Rekognition, local deterministic moderation, SQS, S3 media
- `rmit_society/handlers/` — `APIRouter`s per domain (mounted by `server.py`) + legacy Lambda `handler`s
- `rmit_society/workers/` — SQS moderation/image/event consumers and the ECS analytics worker

## Entry points

- Server (EC2 / local): `uvicorn rmit_society.server:app`
- Docker: `backend/Dockerfile` runs the server on port 8000 (used by the EC2 backend)
- SQS Lambda consumers: `rmit_society.workers.lambda_handlers.{moderation_handler,image_handler,event_handler}`
- ECS analytics worker: `python -m rmit_society.workers.analytics`

## Checks

```sh
uv run ruff check .
uv run mypy
uv run pytest
```
