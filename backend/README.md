# RMIT Society API

The API is a Node.js 22 modular monolith built with Hono, TypeScript, Drizzle ORM, and PostgreSQL. It owns authentication, societies, threads, comments, voting, reports, moderation, media metadata, content-analysis orchestration, and administrator analytics APIs.

Its enforced dependency direction is route → controller → service → repository port → infrastructure adapter. See [the backend architecture](../docs/backend-architecture/BACKEND_ARCHITECTURE.md) before changing a module.

## Requirements

- Node.js 22 (`>=22 <23`)
- Corepack and pnpm 10.13+
- Docker Desktop with Docker Compose for local PostgreSQL

## Run locally

```sh
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env
docker compose up -d
pnpm db:migrate
pnpm db:seed
pnpm dev
```

The API listens on `http://localhost:3000`. The local web client defaults to that origin; start it from `../web` with `pnpm dev`.

Verify the process and database separately:

| Endpoint | Meaning |
| --- | --- |
| `GET /api/v1/health/live` | The API process is running; it does not query PostgreSQL. |
| `GET /api/v1/health/ready` | The API can complete a lightweight PostgreSQL query. |
| `GET /docs` | Swagger UI. |
| `GET /api/v1/openapi.json` | Generated OpenAPI 3.1 document. |

Stop the local database when finished:

```sh
docker compose down
```

## Commands

```sh
pnpm dev                     # watch-mode API
pnpm start                   # compiled API
pnpm typecheck               # TypeScript validation
pnpm lint                    # Oxlint
pnpm test                    # Vitest
pnpm check                   # typecheck, lint, test, production build
pnpm build                   # production API build
pnpm db:generate             # generate a Drizzle migration from schema changes
pnpm db:migrate              # apply committed migrations
pnpm db:seed                 # idempotent deterministic demo seed
pnpm db:studio               # Drizzle local database UI
pnpm build:content-analysis  # package the optional content-analysis Lambda
pnpm build:analytics-workflow # package the optional analytics workflow Lambda
```

## Configuration

Copy `.env.example` to `.env`; it documents all local variables. Do not commit the copy.

| Setting | Local default | Use |
| --- | --- | --- |
| `DATABASE_URL` | Local Compose PostgreSQL | Required database connection. |
| `WEB_ORIGIN` | `http://localhost:5173` | Browser origin allowed by CORS. |
| `ALLOWED_EMAIL_DOMAINS` | RMIT AU/VN/EU values | Registration allow-list. Keep it configurable. |
| `AWS_REGION` + `MEDIA_BUCKET` | Unset | Enables local testing against an S3 media bucket through the standard AWS credential chain. |
| `OPENROUTER_*` | Unset | Optional local content-analysis invocation. Do not commit the key. |
| `ANALYTICS_REFRESH_STATE_MACHINE_ARN` | Unset | Optional production-style Step Functions analytics orchestration. |
| `ANALYTICS_SCHEDULER_SECRET` | Unset | Authenticates the non-browser scheduled analytics route. |
| `ANALYTICS_PSEUDONYM_KEY` | Empty template value | Required in production; use at least 32 bytes of random key material. |

In AWS, ECS injects the database URL from Secrets Manager and sets verified PostgreSQL TLS. The production image includes the RDS CA bundle. Do not bake secrets into Docker images, source, task definitions, or OpenTofu variables.

## Deterministic demo data

`pnpm db:seed` is idempotent. It creates a system administrator, student users, societies, memberships, threads, comments, reports, and deterministic votes suitable for the assessment demonstration. Re-running it restores the seeded administrator's development credentials and active status.

The seed administrator is `seed.admin@rmit.edu.au` with password `SeedPass123!`; every seeded student uses the same development password. These accounts are for a local or controlled demonstration only. Change actual user credentials through the product and never reuse the seed password for a real account.

## Deployment

Do not deploy this directory directly. The root deployment workflow builds the Docker image, pushes it to ECR, applies migrations through the one-shot ECS bootstrap task, starts the ECS service, and publishes the web client. Follow the [deployment guide](../docs/deployment/README.md).

For code-only backend updates after a working deployment:

```sh
cd ..
make push-backend
```

For schema or seed changes, run `make migrate-seed` before publishing backend code that depends on those changes.

## Analytics and content analysis

Both are feature-gated infrastructure paths. The administrator analytics workflow creates durable, range-scoped refresh runs; Step Functions coordinates Glue and Athena; a workflow Lambda persists results. Never start an analytics workflow with empty input. See [analytics](../docs/analytics/README.md).

Content analysis is initially deployed in `shadow` mode after the active Learner Lab, Lambda artifact, and OpenRouter secret have been confirmed. See [content-analysis documentation](../docs/content-analysis/).
