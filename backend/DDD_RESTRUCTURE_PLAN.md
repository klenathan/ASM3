# Backend DDD Restructure Master Plan

- **Status:** Phases 0–4 complete; Phases 5–9 pending
- **Scope:** `backend/src/rmit_society`, backend tests, Alembic imports, and runtime entry-point references
- **Goal:** Organize backend by business domain, with each domain owning small `models`, `repositories`, `services`, and `controllers` modules.
- **Product source:** [`../PRODUCT.md`](../PRODUCT.md)

## 1. Objective

Replace broad horizontal and catch-all modules with a modular monolith built from bounded business contexts.

Each context must own:

- `models/` — entities, value objects, domain events, enums, and invariants
- `repositories/` — repository protocols, SQLAlchemy tables, and PostgreSQL adapters
- `services/` — application use cases and transaction orchestration
- `controllers/` — FastAPI routes, request/response schemas, and HTTP mapping
- `providers/` — optional external-service adapters such as Cognito, S3, Comprehend, Rekognition, ECS, or Athena
- `workers/` — optional asynchronous inbound adapters for SQS, S3, or scheduled jobs

This is an internal restructure. Preserve product behavior, `/api/v1` contracts, PostgreSQL tables, moderation rules, AWS workflows, and deployment entry points unless a separately approved change requires otherwise.

## 2. Current Baseline

Current code already has partial domain packages (`identity`, `community`, `media`, `moderation`, and `analytics`), but several files still combine unrelated responsibilities:

| Current file                         |      Size | Problem                                                                                       |
| ------------------------------------ | --------: | --------------------------------------------------------------------------------------------- |
| `community/application.py`           | 621 lines | Societies, posts, comments, feeds, engagement, and notifications share one application module |
| `repositories/postgres_community.py` | 437 lines | Four persistence concerns share one adapter                                                   |
| `repositories/postgres_base.py`      | 423 lines | Every ORM table and database helper is centralized                                            |
| `community/api.py`                   | 379 lines | All community HTTP routes share one controller                                                |
| `moderation/providers.py`            | 304 lines | Decision policy and three provider adapters are combined                                      |
| `moderation/application.py`          | 246 lines | Queue review, reports, appeals, audit, and content transitions are combined                   |
| `auth/jwt.py`                        | 242 lines | JWT contract, local implementation, Cognito implementation, and factory are combined          |
| `identity/api.py`                    | 222 lines | Profile and authentication endpoints are combined                                             |
| `community/domain.py`                | 205 lines | Space, content, engagement, report, and notification models are combined                      |

The working tree also contains an in-progress deletion/move of old `domain/`, `services/`, `handlers/`, `providers/`, and worker modules. Some tests still import those deleted modules and still configure the removed DynamoDB path. Preserve this work; first migration phase must reconcile it rather than restore or discard it blindly.

## 3. Architectural Decisions

### 3.1 Style

Use a **DDD-inspired modular monolith**, not microservices.

- One deployable FastAPI application remains at `rmit_society.server:app`.
- Existing Lambda and ECS worker entry points remain stable through compatibility wrappers until infrastructure references are updated together.
- Business contexts isolate ownership in code; they may share one PostgreSQL database.
- Direct boto3 infrastructure reconciliation remains unchanged by this restructure.

### 3.2 Dependency direction

Allowed dependency direction inside each context:

```text
controllers/workers -> services -> models
                           |
                           v
                 repository/provider protocols
                           ^
                           |
             repository/provider implementations
```

Rules:

1. Models import only Python/Pydantic primitives and minimal shared-kernel types.
2. Services depend on protocols, never concrete PostgreSQL or AWS adapters.
3. Controllers perform authentication, validation, use-case invocation, and response mapping only.
4. Repository adapters contain persistence mapping and queries, not authorization or business policy.
5. Provider adapters normalize external failures into stable domain/application errors.
6. Cross-context calls use a narrow public service/port or versioned event—not another context's repository adapter.
7. `shared/` contains technical primitives used by multiple contexts; it must not become a miscellaneous business-logic folder.
8. No module-level repository/service construction in controllers. FastAPI dependencies resolve objects from the composition root.
9. Transactions are application-service boundaries. Multi-write use cases use one SQLAlchemy unit of work where atomicity is required.
10. Tenant and role authorization remains server-side in every protected use case.

### 3.3 File-size and responsibility targets

- Prefer one aggregate, use-case group, controller resource, or adapter per file.
- Target under 200 lines per hand-written file.
- Review files over 250 lines for another responsibility split.
- Do not permit new catch-all `domain.py`, `application.py`, `api.py`, `providers.py`, or `postgres_community.py` modules.
- Generated Alembic revisions are exempt.
- Split by behavior, not arbitrary line ranges.

### 3.4 Contract and data stability

During structural migration:

- Keep route paths, methods, status codes, auth requirements, and response shapes stable.
- Keep PostgreSQL table/column/index/constraint names stable.
- Do not generate an Alembic migration for file moves alone.
- Keep UTC ISO 8601 API timestamps and timezone-aware internal timestamps.
- Keep opaque IDs, moderation state transitions, idempotency, tenant fields, and feed visibility rules unchanged.
- Keep S3 private and never expose raw moderation payloads, content bodies in logs, tokens, emails, or presigned URLs.

## 4. Target Business Contexts

| Context         | Owns                                                                                            | Does not own                                  |
| --------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `identity`      | Users, profiles, institution membership, roles/status, registration, Cognito token verification | Spaces or social relationships                |
| `spaces`        | Societies/spaces, memberships, moderators, rules, pin/lock authorization policy                 | Post bodies or moderation decisions           |
| `content`       | Posts, comments, content versions, edit/delete lifecycle, reply depth                           | Feed projections or AI provider calls         |
| `engagement`    | Votes, follows, blocks, counters triggered by engagement                                        | Reports, notifications, feed storage          |
| `feeds`         | School, joined-space, following, space, and author feed projections/queries                     | Content authoring                             |
| `moderation`    | Reports, moderation jobs/decisions, review queue, appeals, audit trail, policy normalization    | Raw provider clients or public feed rendering |
| `notifications` | Notification records, delivery eligibility, read state                                          | Moderation decisions themselves               |
| `media`         | Upload records, quarantine/approved object lifecycle, access authorization                      | Content text moderation                       |
| `analytics`     | Sanitized events, S3 export, Athena/ECS execution                                               | Identifiable/raw content analytics            |
| `system`        | Health endpoints and runtime diagnostics                                                        | Business entities                             |

Ownership choices:

- `Report` moves from community/engagement into `moderation` because its lifecycle is resolved by safety workflows.
- `Notification` becomes its own context because moderation, engagement, content, and spaces all emit notification-triggering events.
- `FeedEntry` belongs to `feeds`; content only emits publication/suppression events.
- `ContentState` belongs to `content`; moderation receives a narrow content moderation port and may request valid transitions.
- Shared event envelopes and correlation metadata stay in `shared`.

## 5. Target Package Layout

```text
backend/src/rmit_society/
├── server.py                         # Stable ASGI export only
├── bootstrap.py                      # Composition root/container construction
├── settings.py                       # Runtime settings facade
├── shared/
│   ├── models/
│   │   ├── events.py                 # Event envelope and correlation metadata
│   │   ├── pagination.py             # Page and cursor value types
│   │   └── types.py                  # Truly shared IDs/tenant primitives only
│   ├── repositories/
│   │   ├── database.py               # Engine, session factory, DeclarativeBase
│   │   ├── unit_of_work.py
│   │   └── idempotency.py
│   ├── services/
│   │   ├── clock.py
│   │   ├── ids.py
│   │   └── cursor_codec.py
│   ├── providers/
│   │   ├── aws.py
│   │   ├── messaging.py
│   │   └── logging.py
│   └── controllers/
│       ├── errors.py
│       └── middleware.py
├── identity/
│   ├── models/{user.py, membership.py, registration.py, claims.py}
│   ├── repositories/{interface.py, tables.py, postgres.py}
│   ├── services/{profiles.py, registration.py, authorization.py, tokens.py}
│   ├── controllers/{profile_routes.py, auth_routes.py, schemas.py, dependencies.py}
│   └── providers/{cognito.py, local_jwt.py, cognito_jwt.py}
├── spaces/
│   ├── models/{space.py, membership.py, commands.py}
│   ├── repositories/{interface.py, tables.py, postgres.py}
│   ├── services/{spaces.py, memberships.py, moderators.py}
│   └── controllers/{space_routes.py, membership_routes.py, schemas.py}
├── content/
│   ├── models/{post.py, comment.py, version.py, states.py, commands.py, events.py}
│   ├── repositories/{interface.py, tables.py, postgres_posts.py, postgres_comments.py}
│   ├── services/{posts.py, comments.py, editing.py, visibility.py}
│   └── controllers/{post_routes.py, comment_routes.py, schemas.py}
├── engagement/
│   ├── models/{vote.py, follow.py, block.py, events.py}
│   ├── repositories/{interface.py, tables.py, postgres.py}
│   ├── services/{votes.py, follows.py, blocks.py}
│   └── controllers/{vote_routes.py, relationship_routes.py, schemas.py}
├── feeds/
│   ├── models/{feed_entry.py, queries.py}
│   ├── repositories/{interface.py, tables.py, postgres.py}
│   ├── services/{queries.py, projections.py}
│   ├── controllers/{feed_routes.py, schemas.py}
│   └── workers/{event_consumer.py}
├── moderation/
│   ├── models/{job.py, decision.py, report.py, appeal.py, audit.py, policy.py, events.py}
│   ├── repositories/{interface.py, tables.py, postgres_jobs.py, postgres_cases.py}
│   ├── services/{classification.py, reviews.py, reports.py, appeals.py, audit.py}
│   ├── controllers/{queue_routes.py, report_routes.py, appeal_routes.py, audit_routes.py, schemas.py}
│   ├── providers/{local_text.py, comprehend.py, rekognition.py}
│   └── workers/{text_consumer.py, decision_consumer.py}
├── notifications/
│   ├── models/{notification.py, events.py}
│   ├── repositories/{interface.py, tables.py, postgres.py}
│   ├── services/{notifications.py, event_handlers.py}
│   ├── controllers/{notification_routes.py, schemas.py}
│   └── workers/{event_consumer.py}
├── media/
│   ├── models/{upload.py, states.py, events.py}
│   ├── repositories/{interface.py, tables.py, postgres.py}
│   ├── services/{uploads.py, access.py, processing.py}
│   ├── controllers/{upload_routes.py, media_routes.py, schemas.py}
│   ├── providers/{s3_media.py, object_store.py}
│   └── workers/{image_consumer.py}
├── analytics/
│   ├── models/{events.py, queries.py}
│   ├── repositories/{interface.py}
│   ├── services/{exports.py, queries.py, jobs.py}
│   ├── controllers/{analytics_routes.py, schemas.py}
│   ├── providers/{s3_export.py, athena.py, ecs.py}
│   └── workers/{event_consumer.py, aggregate.py}
└── system/
    └── controllers/health_routes.py
```

Empty folders must not be created pre-emptively. Add files only when responsibility moves into them. Each package exports a small intentional public surface through `__init__.py`; internal adapters remain private to the context.

## 6. Composition and Persistence Design

### 6.1 Composition root

`bootstrap.py` will:

1. Build settings, clock, ID generator, logger, AWS clients, SQLAlchemy engine, and session factory.
2. Construct concrete repositories/providers.
3. Inject protocols into services.
4. Expose FastAPI dependency providers for controllers.
5. Register routers on the combined app.
6. Construct worker handlers from the same service factories without importing FastAPI.

`server.py` should only create the app, include routers, and export `app`.

### 6.2 Repositories

Replace the broad `Repository` protocol and `PostgresRepository` multiple-inheritance aggregate with narrow context interfaces.

Examples:

- `UserRepository`
- `SpaceRepository` and `SpaceMembershipRepository`
- `PostRepository`, `CommentRepository`, and `ContentVersionRepository`
- `EngagementRepository`
- `FeedRepository`
- `ModerationCaseRepository` and `AuditRepository`
- `NotificationRepository`
- `UploadRepository`

Services request only methods they use. Cross-context reads use explicit ports such as `SpaceAccessReader`, `ContentModerationPort`, or `UserSummaryReader`.

### 6.3 SQLAlchemy tables

- Move ORM tables from `repositories/postgres_base.py` into owning context `repositories/tables.py` files.
- Keep only `DeclarativeBase`, engine/session setup, and generic transaction utilities shared.
- Add a metadata aggregator that imports each context's tables before Alembic accesses `Base.metadata`.
- Preserve existing table names and constraints during moves.
- Prefer explicit row-to-domain and domain-to-row mappers in each adapter.
- Keep PostgreSQL `ON CONFLICT` and conditional transition semantics where races matter.
- Add stable cursor limits/order predicates to list methods; do not retain unbounded request-path lists as final behavior.

### 6.4 Unit of work

Introduce a small SQLAlchemy unit-of-work protocol for operations requiring atomic updates, including:

- create content + save version + enqueue outbox record
- vote/unvote + counter update
- join/leave + member counter update
- moderation transition + decision + audit event
- appeal decision + content transition + audit event

Do not make network calls while a database transaction is open. Persist an outbox/event record, commit, then publish asynchronously.

## 7. Current-to-Target Migration Map

| Current source                                                | Target ownership                                                                                                           |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `community/domain.py`                                         | Split across `spaces/models`, `content/models`, `engagement/models`, `moderation/models/report.py`, `notifications/models` |
| `community/application.py`                                    | Split across context services; feed helpers move to `feeds/services`                                                       |
| `community/api.py`                                            | Split into space, post, comment, engagement, notification, and feed controllers                                            |
| `identity/domain.py`                                          | `identity/models/user.py` and `identity/models/registration.py`                                                            |
| `identity/application.py`                                     | `identity/services/profiles.py` and `registration.py`                                                                      |
| `identity/api.py`                                             | Profile/auth controllers plus Cognito provider                                                                             |
| `auth/claims.py`                                              | `identity/models/claims.py`                                                                                                |
| `auth/dependencies.py`                                        | `identity/controllers/dependencies.py`                                                                                     |
| `auth/jwt.py`                                                 | JWT protocol/service plus separate local/Cognito providers                                                                 |
| `repositories/interfaces.py`                                  | Narrow interfaces inside each owning context                                                                               |
| `repositories/postgres_base.py`                               | Shared DB primitives plus per-context table modules                                                                        |
| `repositories/postgres_community.py`                          | Space, content, engagement, feed, report, and notification adapters                                                        |
| `repositories/postgres_identity.py`                           | `identity/repositories/postgres.py`; idempotency moves to shared repository                                                |
| `repositories/postgres_moderation.py`                         | Moderation job/case/audit adapters                                                                                         |
| `repositories/postgres_media.py`                              | Media adapter                                                                                                              |
| `repositories/postgres.py` and `factory.py`                   | Composition root and dependency factories                                                                                  |
| `moderation/domain.py`                                        | Focused moderation model files                                                                                             |
| `moderation/application.py`                                   | Review, report, appeal, audit, and classification services                                                                 |
| `moderation/providers.py`                                     | Policy normalization plus one provider per file                                                                            |
| `moderation/api.py`                                           | Queue, report, appeal, and audit controllers                                                                               |
| `media/application.py`                                        | Upload, access, and processing services                                                                                    |
| `media/providers.py`                                          | S3 media and object-store providers                                                                                        |
| `media/api.py`                                                | Upload and media controllers                                                                                               |
| `analytics/*`                                                 | Focused analytics model/service/provider/controller/worker modules                                                         |
| `base.py`                                                     | Clock, IDs, and cursor codec under `shared/services`                                                                       |
| `api.py`, `errors.py`, `logging.py`, `aws.py`, `messaging.py` | Minimal shared controller/provider infrastructure                                                                          |
| `workers/lambda_handlers.py`                                  | Stable wrappers delegating to context worker consumers                                                                     |

## 8. Incremental Implementation Sequence

Every phase must leave `rmit_society.server:app` importable and preserve unrelated working-tree changes.

### Phase 0 — Stabilize and freeze contracts

- [x] Inventory uncommitted moves/deletions and identify their intended replacement modules.
- [x] Reconcile stale test imports referencing deleted `domain`, `services`, DynamoDB, and handler modules with temporary compatibility exports.
- [x] Confirm PostgreSQL is the deployed primary repository target; retain DynamoDB adapter only as a temporary legacy-test compatibility path.
- [x] Capture current OpenAPI route/schema assertions and verify the ASGI import.
- [x] Record existing PostgreSQL metadata/table names and current Alembic state.
- [x] Run baseline Ruff, mypy, pytest, and app import; record infrastructure-test and Alembic environment failures separately.

**Exit:** Current intended architecture has one coherent baseline before further moves.

### Phase 1 — Shared kernel and composition root

- [x] Create minimal shared clock, ID, cursor, event, database, error, logging, and messaging modules.
- [x] Introduce app/service factories in `bootstrap.py`.
- [x] Replace controller construction paths with the composition-root repository factory.
- [x] Keep compatibility imports for callers not migrated in this phase.
- [x] Keep domain models free of FastAPI, boto3, and SQLAlchemy imports.

**Exit:** Dependency injection exists; behavior and routes remain unchanged.

### Phase 2 — Identity context

- [x] Split user/registration/claims models.
- [x] Split profile, registration, authorization, and token services.
- [x] Split profile and auth controller surfaces.
- [x] Split local and Cognito JWT/provider adapter surfaces.
- [x] Move identity ORM/repository ownership surface.
- [x] Preserve JWT issuer, audience, signature, expiry, status, role, and tenant checks.
- [x] Update identity compatibility imports and retain existing coverage.

**Exit:** Identity has no imports from old broad repository or auth modules.

### Phase 3 — Spaces context

- [x] Move society and membership model surfaces.
- [x] Create narrow space/membership repository interfaces and PostgreSQL adapter surfaces.
- [x] Split create/update/discovery, join/leave, and moderator assignment service surfaces.
- [x] Split space and membership controller surfaces while preserving `/societies` and `/r/{slug}` contracts.
- [x] Preserve tenant checks, membership uniqueness, moderator authorization, and member counters.
- [x] Retain owner/admin/moderator and cross-tenant coverage.

**Exit:** Spaces are independent from `community`.

### Phase 4 — Content context

- [x] Move post, comment, content-version, state, command, and event model surfaces.
- [x] Split post/comment/version repository and table ownership surfaces.
- [x] Split post, comment, edit, delete, pin, lock, and visibility service surfaces.
- [x] Introduce narrow space-access and media-ownership repository ports.
- [x] Split post and comment controller surfaces.
- [x] Preserve immutable versions, edit windows, bounded depth, lock behavior, fail-closed moderation, and author-only pending visibility.
- [x] Retain ownership, state-transition, duplicate-event, and tenant-boundary coverage.

**Exit:** Content emits events but does not import moderation, feeds, analytics, or notification adapters.

### Phase 5 — Engagement, feeds, and notifications

- [ ] Move vote/follow/block models and adapters into `engagement`.
- [ ] Move feed projection model, queries, adapter, and event consumer into `feeds` (model/query/consumer surfaces added; adapter migration pending).
- [ ] Move notification model, adapter, services, controller, and event consumer into `notifications` (model/service surfaces added; adapter/controller migration pending).
- [ ] Replace direct cross-context writes with events/outbox handlers where needed.
- [x] Add atomic vote/counter and membership/counter updates.
- [x] Implement bounded deterministic queries for feeds and notifications; opaque cursor decoding remains pending.
- [ ] Preserve blocked-content suppression and approved/flagged feed rules.
- [ ] Test duplicate votes/follows, block visibility, cursor stability, and no pending/rejected/failed feed exposure.

**Exit:** No feed or notification behavior remains in `community`.

### Phase 6 — Moderation and reports

- [ ] Move report ownership from engagement/community into moderation.
- [x] Split jobs, decisions, appeals, policy, and event model surfaces; report/audit split remains pending.
- [ ] Split classification, review, report, appeal, and audit services.
- [x] Split local, Comprehend, and Rekognition provider entry points.
- [ ] Split HTTP controllers and SQS consumers.
- [x] Use a narrow content moderation port for conditional state changes.
- [x] Persist provider/model/policy metadata while keeping raw provider output private.
- [ ] Test threshold boundaries, unsupported input, timeout/error, duplicates, reviewer override, report resolution, appeal reversal, and audit completeness.

**Exit:** Moderation policy is domain-testable without AWS or FastAPI.

### Phase 7 — Media context

- [ ] Split upload, access, and processing services.
- [ ] Split upload/media controllers and S3/object-store adapters.
- [x] Keep quarantine processing as a media worker using a moderation image-classification port.
- [ ] Preserve private objects, randomized keys, ownership checks, expiry, signature/MIME/size validation, and metadata stripping.
- [ ] Test safe/unsafe upload, invalid signature/type/size, duplicate delivery, provider failure, and unauthorized access.

**Exit:** Media is independently testable with moto and deterministic moderation fixtures.

### Phase 8 — Analytics and worker entry points

- [ ] Split sanitized-event export, Athena query, ECS job, and aggregation responsibilities.
- [x] Ensure analytics receives sanitized events only; no body, email, JWT, URL, or raw AI payload.
- [x] Keep `workers/lambda_handlers.py` as thin compatibility delegates until infra handler paths are changed together.
- [ ] Keep `python -m rmit_society.workers.analytics` compatible or update `Dockerfile.worker` in the same change.
- [ ] Test duplicate events, malformed events, sanitized payloads, and provider errors.

**Exit:** Every worker invokes a context service and contains no business policy.

### Phase 9 — Remove compatibility layer and enforce boundaries

- [ ] Delete empty `community`, broad `repositories`, old `auth`, and compatibility modules only after all imports migrate.
- [x] Update Alembic metadata imports without generating schema churn.
- [ ] Update Docker, infra handler strings, README, and OpenAPI references where paths changed.
- [ ] Add import-boundary checks and file-size reporting to CI or backend validation tooling.
- [ ] Search for forbidden old imports and module-level repository construction.
- [ ] Run full validation suite and compare OpenAPI/database metadata against Phase 0 snapshots.

**Exit:** Target package layout is authoritative; no duplicate implementation remains.

## 9. Test Layout

Mirror business contexts while separating test layers:

```text
backend/tests/
├── unit/{identity,spaces,content,engagement,feeds,moderation,notifications,media,analytics}/
├── api/{identity,spaces,content,engagement,feeds,moderation,notifications,media,analytics}/
├── repositories/{identity,spaces,content,engagement,feeds,moderation,notifications,media}/
├── workers/{feeds,moderation,notifications,media,analytics}/
├── architecture/test_import_boundaries.py
├── contract/test_openapi.py
└── conftest.py
```

Test rules:

- Domain/service tests use fakes implementing narrow protocols.
- PostgreSQL adapters receive focused persistence tests, including uniqueness and conditional transitions.
- AWS adapters use moto/mocks and synthetic fixtures; paid moderation APIs never run by default.
- API tests cover success, validation, unauthenticated, forbidden, cross-tenant, conflict, pagination, and user-visible moderation states.
- Worker tests cover duplicate and out-of-order delivery, idempotency, retry, and failure behavior.
- Architecture tests fail on forbidden inward dependencies or imports of removed compatibility modules.

## 10. Validation Per Phase

Run cheapest checks first from `backend/`:

```sh
uv run ruff check <changed paths>
uv run mypy
uv run pytest <focused tests>
uv run pytest
```

Then validate integration surfaces when affected:

```sh
uv run python -c "from rmit_society.server import app; print(app.title)"
uv run alembic current
uv run alembic check
```

For route changes, compare OpenAPI paths, methods, security, status codes, and schemas. For table moves, compare metadata and verify Alembic reports no unintended schema operations.

## 11. Risks and Controls

| Risk                             | Control                                                           |
| -------------------------------- | ----------------------------------------------------------------- |
| Big-bang import breakage         | Move one context vertically; keep temporary compatibility exports |
| Losing current uncommitted work  | Inventory first; never reset or restore blindly                   |
| API contract drift               | Contract tests/OpenAPI comparison in every controller phase       |
| Accidental database migration    | Preserve table metadata; run Alembic check before merge           |
| Circular context dependencies    | Narrow ports, event contracts, and architecture tests             |
| Shared folder becoming catch-all | Shared-kernel review rule: no context-specific business behavior  |
| Transaction regressions          | Unit of work plus concurrency/idempotency repository tests        |
| AWS handler breakage             | Stable wrappers until infra/Docker references change atomically   |
| Authorization regression         | Service-level tenant/role checks plus API boundary tests          |
| Moderation bypass                | Explicit state machine and fail-closed tests before/after moves   |
| File count without better design | Split by aggregate/use case, not by line count alone              |

## 12. Definition of Done

Restructure is complete when:

- [ ] Every business context owns `models`, `repositories`, `services`, and `controllers` packages where applicable.
- [ ] No hand-written catch-all module combines multiple business contexts.
- [ ] Controllers contain no SQL/boto3 calls or business policy.
- [ ] Services depend only on narrow protocols and models.
- [ ] ORM tables and adapters live with their owning contexts.
- [ ] Cross-context behavior uses public ports or versioned events.
- [ ] Tenant authorization and moderation lifecycle rules pass at service and API layers.
- [ ] Public API and database schema remain compatible unless separately approved and migrated.
- [ ] Server, Lambda handlers, and ECS worker entry points work.
- [ ] Ruff, strict mypy, pytest, app import, OpenAPI contract checks, and Alembic checks pass.
- [ ] README and architecture documentation describe final layout and dependency rules.
- [ ] No stale imports, duplicate implementations, DynamoDB-only assumptions, generated files, or `__pycache__` artifacts remain in tracked source.
