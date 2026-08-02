# RMIT Society API

Node.js 22 backend for RMIT Society. Built with Hono, TypeScript 7, Drizzle ORM, and PostgreSQL 17.

Accepted modular-monolith structure, DDD layer boundaries, logical data model, and implementation order are documented in [`../docs/BACKEND_ARCHITECTURE.md`](../docs/BACKEND_ARCHITECTURE.md). Product schema migrations remain deferred until implementation of each tested vertical slice.

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
- S3 media workflows
- AWS SDK integrations
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
```

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

Production values will be injected through the ECS task definition. Set `DATABASE_SSL=true` for RDS after validating the RDS certificate chain in the deployment image. Secrets must come from ECS-supported SSM Parameter Store or Secrets Manager references, never image layers or source files.

## Registration-domain policy

Approved RMIT domains live in `src/config/email-domains.ts`, not environment variables. The list is deliberately empty until AU, VN, and EU domains are confirmed. Future authentication must reject registration when the list is empty.

## Deployment assumptions

Target request path:

```text
Browser → CloudFront /api/* → API Gateway → ECS on EC2 → RDS PostgreSQL
```

CloudFront/API Gateway routing and ECS infrastructure are separate deployment work. API responses remain non-cacheable unless a future route explicitly defines safe caching.
