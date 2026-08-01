# AGENTS.md

## Purpose

Build an AI-assisted, school-focused social forum. Product behavior and priorities live in [`PRODUCT.md`](./PRODUCT.md). Read it before changing features, data models, moderation, or infrastructure.

This repository currently contains a **CloudPulse weather/analytics scaffold**. Treat CloudPulse names, models, handlers, UI, and seed data as legacy implementation to migrate—not product requirements. Replace them incrementally; keep the application runnable while doing so.

## Product priorities

When requirements compete, use this order:

1. User safety and school-community trust
2. Privacy, authorization, and tenant isolation
3. Reliable posting, feeds, replies, and moderation
4. Accessibility and clear user feedback
5. Operational simplicity and AWS cost control
6. Engagement features

This is a social forum first. AI moderation supports the community; it is not the product itself and is not the final authority in ambiguous cases.

## Repository map

- `apps/web/` — React 19, TypeScript, Vite, Tailwind CSS, shadcn/Base UI frontend
- `backend/` — Python 3.12, FastAPI, Pydantic, boto3; EC2 server app + Lambda SQS consumers and ECS worker
- `backend/tests/` — pytest tests
- `infra/` — service-focused, idempotent boto3 provisioning and Lambda packaging
- `README.md` — host development and real AWS deployment instructions
- `PRODUCT.md` — product scope, flows, safety policy, and success criteria

## Target architecture

Use managed AWS services in deployed dev/prod stages. Use moto and deterministic fixtures for host-side AWS adapter tests; no local AWS emulator.

- **Web:** React SPA hosted in private S3 and delivered by CloudFront
- **Identity:** Amazon Cognito; verified institution membership and role claims
- **API:** FastAPI server on EC2 (`rmit_society.server:app`); SQS consumers (moderation/image/events) stay on Lambda for now
- **Primary data:** DynamoDB for users, schools/spaces, posts, replies, reactions, reports, moderation state, and audit references
- **Media:** private S3 uploads through short-lived presigned URLs
- **Moderation:** Amazon Comprehend `DetectToxicContent` for supported text and Amazon Rekognition moderation labels for images
- **Async work:** SQS/EventBridge and Lambda for moderation and notifications; retries must be idempotent and failed jobs must enter a DLQ
- **Containers:** ECS Fargate worker for batch analytics or other justified long-running jobs
- **Analytics:** sanitized event data in S3, Glue catalog, and Athena queries
- **Observability:** CloudWatch structured logs, metrics, alarms, and request correlation IDs

Every AWS service claimed by the assessment must be invoked by an application workflow, not only by deployment scripts, CLI commands, or console actions.

Do not introduce another cloud, database, auth provider, or infrastructure framework without explicit approval. Existing infrastructure uses direct boto3 reconciliation rather than CloudFormation/CDK; preserve that approach unless requirements change.

## AWS development

- Authenticate through AWS IAM Identity Center, `AWS_PROFILE`, or attached roles. Never track access keys or session tokens.
- Run automated AWS adapter tests with moto and deterministic moderation fixtures. Never call paid moderation APIs from tests by default.
- Run integration smoke tests only against an explicitly selected isolated `dev` stage.
- boto3 clients use normal AWS regional endpoints; do not add endpoint overrides or emulator branches.
- `.env.example` contains placeholders only. Runtime resource values come from `.deploy/<stage>.json` and IaC-injected environment variables.
- Tests must not depend on external AWS state or execution order unless explicitly marked as integration tests.

## Core domain rules

- A user belongs to an institution/school tenant before accessing tenant content.
- Enforce tenant and role authorization server-side on every protected operation. Client-side route guards are not authorization.
- Content lifecycle is explicit: `PENDING` → `APPROVED`, `FLAGGED`, `REJECTED`, or `FAILED`.
- Never expose `PENDING`, `REJECTED`, or moderation-failed content in public feeds.
- Moderation failures fail closed for new content and remain retryable.
- Store moderation provider, model/version, labels, scores, threshold policy version, decision, timestamps, and reviewer outcome.
- Thresholds are configuration, not duplicated magic numbers in handlers or UI.
- Automated flags do not silently create permanent account penalties. High-impact decisions require a traceable moderator action and an appeal path.
- Deleting content removes it from user views immediately while retaining only the minimum audit record required by policy.
- Use UTC ISO 8601 timestamps at API boundaries and timezone-aware `datetime` values internally.
- Generate opaque IDs server-side. Do not expose emails or encode sensitive data in IDs, object keys, logs, or analytics.
- Feed and list endpoints use stable cursor pagination; never add unbounded DynamoDB scans to request paths.
- Mutation retries must be idempotent. Moderation workers must safely handle duplicate delivery.

## Security and privacy

- Never commit secrets, real AWS credentials, tokens, `.env`, production exports, or school/user data.
- Validate Cognito JWT issuer, audience, signature, expiry, and role/tenant claims.
- Apply least-privilege IAM per Lambda and ECS task. Avoid wildcard actions/resources unless AWS requires them and rationale is documented.
- Keep S3 buckets private. Validate file signature, media type, extension, and size; use randomized keys and expiring upload/download URLs.
- Do not make user-generated media public directly from S3.
- Sanitize untrusted text and never render raw HTML.
- Do not log post bodies, comments, email addresses, uploaded media, JWTs, presigned URLs, or raw AI payloads. Log IDs, decision codes, latency, and redacted errors.
- Do not use facial recognition, identity inference, or biometric analysis. Rekognition use is limited to content-safety labels.
- Separate operational analytics from identifiable user data. Document retention and deletion behavior for newly stored data.
- Rate-limit posting, reactions, reports, uploads, and auth-sensitive endpoints.

## Backend conventions

- Keep handlers thin: parse/authenticate → call service/domain logic → serialize response.
- Put AWS access behind repositories/providers; domain logic must be testable without live AWS.
- Use Pydantic models for request, response, configuration, and event schemas.
- Preserve strict mypy and Ruff settings. Add explicit types; do not spread `Any` beyond boto3 boundaries.
- Convert provider exceptions to stable domain/API errors. Do not leak AWS internals to clients.
- Use conditional DynamoDB writes for uniqueness, state transitions, reactions, and counters where races matter.
- Prefer queryable key design and denormalized read models over scans. Document new partition/sort keys and GSIs.
- Version asynchronous event payloads from their first release.
- Test domain decisions separately from AWS adapter behavior.

Run backend checks from `backend/`:

```sh
uv sync
uv run ruff check .
uv run mypy
uv run pytest
```

Local API example:

```sh
uv run uvicorn rmit_society.server:app --reload --app-dir src --port 8000
```

OpenAPI/Swagger UI is available at `http://localhost:8000/docs`; ReDoc is at
`http://localhost:8000/redoc`; raw schema is at `http://localhost:8000/openapi.json`.
API routes use `/api/v1`. Protected operations document Cognito `bearerAuth`.

Before implementing frontend API calls, start the backend and inspect `/docs` or
`/openapi.json` for current paths, request models, response models, status codes, and
authentication requirements. Do not infer API contracts from legacy CloudPulse code.

Rename the Python package and handler paths only as a coordinated migration across packaging, tests, Docker, and infrastructure.

## Frontend conventions

- Use TypeScript strictness and the `@/` source alias.
- Explore the backend OpenAPI page at `http://localhost:8000/docs` before coding
  frontend integrations; use `/openapi.json` when inspecting the machine-readable
  contract.
- Prefer existing UI primitives in `apps/web/src/components/ui/` over new dependencies or custom replacements.
- Keep server state in TanStack Query; keep ephemeral presentation state local.
- Centralize API calls, runtime configuration, auth token handling, and error mapping.
- Represent pending moderation, flagged/rejected content, retries, and appeals explicitly. Never use optimistic public-feed insertion before approval.
- Meet WCAG 2.1 AA: semantic elements, keyboard access, visible focus, labels, contrast, reduced-motion support, and useful loading/error states.
- Build responsive layouts mobile-first.
- Do not reveal internal moderation thresholds or unsafe raw provider output to ordinary users.

Run frontend checks from `apps/web/`:

```sh
pnpm install
pnpm lint
pnpm test
pnpm build
```

Use `pnpm` only. Update `pnpm-lock.yaml` through pnpm; never edit it manually.

## Infrastructure conventions

- Provisioning must be rerunnable and converge safely in `local`, `dev`, and `prod` stages.
- Derive resource names from project and stage. Never hard-code account IDs, real ARNs, VPC IDs, or credentials.
- Keep boto3 clients on standard AWS endpoints and credential chain; validate target account before provisioning.
- Encrypt stored data, block public S3 access, configure CORS narrowly, and set retention/lifecycle rules.
- Add retries, DLQs, alarms, log retention, and least-privilege policies with asynchronous resources.
- Destructive migrations, deployments, and teardown require explicit user approval.
- Do not manually edit generated archives, build output, `.deploy/`, or `node_modules/`.

## Testing expectations

For each behavior change, cover the smallest relevant layers:

- Domain/unit tests for moderation decisions and authorization
- Repository/provider tests with moto/mocks; isolated AWS dev smoke tests where real semantics matter
- API tests for success, validation, unauthorized, forbidden, tenant-boundary, and conflict paths
- Frontend tests for user-visible state and accessibility-sensitive interactions
- End-to-end smoke path when a cross-service flow changes

Moderation tests must include safe content, each supported risk category, threshold boundaries, provider timeout/error, duplicate event, unsupported language/media, reviewer override, and appeal outcome. Fixtures must be synthetic and non-graphic.

## Change workflow

1. Read `PRODUCT.md`, relevant callers, tests, configuration, and infrastructure.
2. Check Git status; preserve unrelated and uncommitted work.
3. Make the smallest complete change. Prefer existing patterns and dependencies.
4. Add or update focused tests and docs.
5. Run cheapest checks first, then affected lint, type, test, and build commands.
6. Report changed paths, validation results, and remaining risks.

Do not edit generated/vendored files, discard user changes, commit, push, deploy, migrate production data, or destroy local state unless explicitly requested.

## Definition of done

A feature is done when:

- Product acceptance behavior is implemented end-to-end.
- Authorization, tenant isolation, moderation state, retries, and failure behavior are defined.
- Relevant tests pass without relying on production AWS or persisted local state.
- Accessibility and responsive behavior are checked.
- New AWS resources are provisioned idempotently in real AWS dev/prod stages; tests use deterministic adapters without paid calls.
- Logs and analytics exclude sensitive content.
- Commands, configuration, interfaces, and architectural decisions are documented.
