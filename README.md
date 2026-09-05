# RMIT Society

RMIT Society is an RMIT-only community forum. Students create societies, threads, comments, votes, reports, and media; society moderators moderate their own societies; system administrators operate the platform and its action-event analytics dashboard.

## Architecture

```text
React SPA (Amplify Hosting)
  └─ /api/* rewrite → API Gateway → ECS service on EC2 → RDS PostgreSQL
                                      ├─ S3 media
                                      ├─ SQS content-analysis jobs → Lambda → OpenRouter
                                      └─ Step Functions → Glue → S3/Athena → Lambda → RDS
```

The content-analysis and analytics paths are optional, gated AWS features. The normal application runs without either feature enabled.

## Documentation

| Need | Start here |
| --- | --- |
| Run the application locally | [Local development](#local-development) |
| Configure AWS and deploy | [Deployment guide](docs/deployment/README.md) |
| Understand OpenTofu resources and outputs | [Infrastructure guide](infras/README.md) |
| Work on the backend | [Backend guide](backend/README.md) |
| Work on the frontend | [Frontend guide](web/README.md) |
| Operate analytics | [Analytics guide](docs/analytics/README.md) |
| Package the assessment submission | [Submission packaging](docs/assessment/ASSESSMENT_3.md#submission-packaging) |
| Browse technical and assessment documentation | [Documentation index](docs/README.md) |

## Prerequisites

### Local development

- Node.js 22 (the backend accepts `>=22 <23`)
- Corepack and pnpm 10
- Docker Desktop with Docker Compose

### AWS deployment

- AWS CLI authenticated to the active AWS Academy Learner Lab account
- OpenTofu 1.9 or newer
- Docker with Buildx
- `curl`, `zip`, and `unzip`
- The Learner Lab-provided `LabRole` and `LabInstanceProfile` in `us-east-1`

Do not create IAM users, roles, or access keys for this project unless the active lab explicitly permits them. Never commit `.env`, `.tfvars`, OpenRouter keys, AWS credentials, database URLs, private keys, state files, or plans.

## Local development

Run the API and web client in separate terminals.

```sh
# Terminal 1: API and local PostgreSQL
cd backend
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env
docker compose up -d
pnpm db:migrate
pnpm db:seed
pnpm dev
```

```sh
# Terminal 2: web client
cd web
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

Open `http://localhost:5173`. The API listens on `http://localhost:3000`; check `http://localhost:3000/api/v1/health/live` before diagnosing browser failures. The local seed is deterministic and development-only. Its credentials are documented in [the backend guide](backend/README.md#deterministic-demo-data); change real-user credentials through the product, not by reusing the seed account.

Stop the local database when finished:

```sh
cd backend
docker compose down
```

## AWS deployment

The deployment is intentionally manual and ordered. Provision infrastructure before publishing artifacts, run the one-shot migration/seed task before serving traffic, and set `app_desired_count = 1` only after that task succeeds.

```sh
cp .env.example .env
# Set AWS_PROFILE or temporary AWS credentials, AWS_REGION=us-east-1, and later STATE_BUCKET.

make whoami
make bootstrap-init
make bootstrap-apply
# Copy the emitted state_bucket_name into STATE_BUCKET in .env.

make init
make plan
make apply                 # initial app_desired_count stays 0
make migrate-seed
# Change app_desired_count to 1 in infras/terraform.tfvars, then:
make plan
make apply
make push-backend
make deploy-frontend
```

Use the full [deployment guide](docs/deployment/README.md) for required configuration, gated features, runtime verification, updates, and teardown. `make cd` is a convenience target for a repeat deployment; it applies infrastructure without a confirmation prompt. Do not use it for an initial deployment or a destructive change.

## Submission packaging

Create a credential-screened source archive with:

```sh
./scripts/create-submission-archive.sh
# Optional destination:
./scripts/create-submission-archive.sh /path/to/code.zip
```

The script creates a ZIP containing only `code/`. It excludes ignored files and common secret/state formats, rejects common credential signatures, and validates the final archive. It does **not** create the required solution architecture document, `doc_images/`, `deploy/`, or `data/` entries. Assemble those items around the generated `code/` directory in the final Canvas submission ZIP as described in [the assessment guide](docs/assessment/ASSESSMENT_3.md#submission-packaging).
