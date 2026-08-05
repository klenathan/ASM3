# RMIT Society API

Node.js 22 backend for RMIT Society. Built with Hono, TypeScript 7, Drizzle ORM, and PostgreSQL 17.

Accepted modular-monolith structure, DDD layer boundaries, logical data model, and implementation order are documented in [`../docs/backend-architecture/BACKEND_ARCHITECTURE.md`](../docs/backend-architecture/BACKEND_ARCHITECTURE.md). Product schema migrations remain deferred until implementation of each tested vertical slice.

## Phase-one scope

Included:

- Node.js Hono server
- PostgreSQL connection pool and Drizzle client
- validated runtime configuration
- liveness and database-readiness endpoints
- OpenAPI 3.1 generation
- structured Pino request logging
- request IDs, secure headers, restricted CORS, and 1 MiB API body limit
- graceful shutdown
- unit tests, linting, type checking, and production build
- local PostgreSQL Compose service
- non-root production Docker image

Deferred:

- product database tables and migrations
- Better Auth and email verification
- analytics

## Requirements

- Node.js 22
- pnpm 10.13.1 through Corepack
- Docker with Compose for local PostgreSQL

## Local setup

```bash
corepack enable
pnpm install
cp .env.example .env
docker compose up -d
pnpm dev
```

API listens on `http://localhost:3000` by default. If host port `5432` is occupied, set `POSTGRES_PORT` to another port and use the same port in `DATABASE_URL` before starting Compose.

| Endpoint | Purpose |
| --- | --- |
| `GET /api/v1/health/live` | Process liveness; does not access PostgreSQL |
| `GET /api/v1/health/ready` | Readiness; runs a lightweight PostgreSQL query |
| `GET /docs` | Swagger UI for interactive API exploration |
| `GET /api/v1/openapi.json` | Generated OpenAPI 3.1 document |

## Commands

```bash
pnpm dev          # watch mode
pnpm check        # typecheck, lint, test, build
pnpm test:watch   # interactive tests
pnpm db:generate  # generate migrations from Drizzle schema
pnpm db:migrate   # apply committed migrations
pnpm db:studio    # inspect local database
pnpm db:seed      # seed demo data (idempotent)
```

## Seed data

`pnpm db:seed` is idempotent and inserts deterministic demo data:

- a `system_admin` owner, plus 8 login-capable student users
- 10 societies with rules, and society-scoped memberships (`member`/`moderator`)
- 26 threads, some with attached images, plus nested comments
- random-but-deterministic upvotes on threads and comments

Seeded avatars and thread images resolve through the public **picsum.photos** API.
Their remote URLs remain readable through `RemoteMediaStorage`. When
`AWS_REGION` and `MEDIA_BUCKET` are configured, new images use the remote bucket:
`request signed PUT → browser uploads directly to S3 → API verifies metadata →
thread stores the ready media id`. Production uses the ECS task's `LabRole`.
Local development uses the standard AWS SDK credential chain and therefore
requires an active AWS session with `s3:PutObject` permission.

The seeded system admin (`seed.admin@rmit.edu.au`) and every seeded student
share the dev password `SeedPass123!` (change logins via the existing auth flow
in a real deployment). Re-running the seed restores the admin's email, password,
role, and active status.

No migration exists yet because phase one intentionally contains no product schema.

## Configuration

Copy `.env.example` to `.env` for local development. Never commit `.env`.

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `NODE_ENV` | No | `development` | Runtime environment |
| `HOST` | No | `0.0.0.0` | Listen address |
| `PORT` | No | `3000` | Listen port |
| `WEB_ORIGIN` | No | `http://localhost:5173` | Only browser origin allowed by CORS |
| `LOG_LEVEL` | No | `info` | Pino log level |
| `POSTGRES_PORT` | No | `5432` | Local Compose host port; ignored by API runtime |
| `DATABASE_URL` | Yes | — | PostgreSQL connection URL |
| `DATABASE_SSL` | No | `false` | Enable verified TLS for PostgreSQL |
| `DATABASE_POOL_MAX` | No | `10` | Maximum PostgreSQL pool clients |
| `AWS_REGION` | Production | — | Region containing the media bucket; configure with `MEDIA_BUCKET` |
| `MEDIA_BUCKET` | Production | — | S3 bucket receiving direct browser uploads |

Production values are injected through the ECS task definition. ECS sets `DATABASE_SSL=true`; the production image includes AWS's RDS CA bundle through `NODE_EXTRA_CA_CERTS`, so certificate verification remains enabled. Secrets must come from ECS-supported SSM Parameter Store or Secrets Manager references, never image layers or source files.

## Registration-domain policy

Approved RMIT domains live in `src/config/email-domains.ts`, not environment variables. The list is deliberately empty until AU, VN, and EU domains are confirmed. Future authentication must reject registration when the list is empty.

## Deployment assumptions

Target request path:

```text
Browser → Amplify Hosting → API Gateway (HTTPS) → backend ECS container on EC2 → RDS PostgreSQL
```

Amplify rewrites `/api/*` to API Gateway so browser sessions remain first-party. API Gateway routing and ECS infrastructure are separate deployment work. API responses remain non-cacheable unless a future route explicitly defines safe caching.
