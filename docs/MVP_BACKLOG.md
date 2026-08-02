# MVP Backlog

Last reviewed: 2026-08-02

## Current Working Slice

The student discussion flow is implemented and verified at unit/component level:

1. Register with an allowed RMIT domain.
2. Sign in with a cookie session that restores after local-storage clearance.
3. Browse and join societies.
4. Create threads, comments, replies, and votes.
5. Read threads only while authenticated.

The registration path now persists the password hash in the account insert. This fixes the previous defect where a new account could register but could not sign in later.

## P0: Required Before an AWS Demo

### Full Stack: S3 media upload and delivery

Owner: backend + frontend

- Implement an S3-backed `MediaStoragePort`; production currently injects `UnconfiguredMediaStorage`, so every media endpoint fails.
- Read `MEDIA_BUCKET` and AWS region from runtime configuration and inject the S3 adapter in `backend/src/server.ts`.
- Add the AWS SDK dependency and use ECS task-role credentials. Do not put access keys in environment files.
- Add a thread-composer attachment flow: request upload, PUT directly to S3, complete upload, attach it, and render attached media.
- Validate attachment ownership and `ready` status when creating or editing threads. Current `mediaIds` processing bypasses the validation path.
- Do not seed `ready` media records unless the S3 object exists. Either upload actual placeholders during seed or leave avatar media IDs null.
- Add service tests for ownership/readiness and an end-to-end upload smoke test.

Relevant files: `backend/src/server.ts`, `backend/src/modules/media/`, `backend/src/modules/discussions/application/thread.service.ts`, `web/src/features/media/`, `web/src/features/societies/society-thread-composer.tsx`.

### Infrastructure: database migration and demo-data automation

Owner: infrastructure + backend

- Run committed Drizzle migrations against RDS before the ECS API service is considered deployable. The runtime image and ECS service currently have no migration step.
- Add an idempotent bootstrap command that creates a usable system administrator from secret-backed credentials.
- Extend the seed command with a student, a moderator membership, threads, comments, a report, and demo credentials. The existing seeded admin has no usable password.
- Document the exact deployment order and a post-deploy health/auth smoke check.

Relevant files: `backend/Dockerfile`, `backend/src/db/seed.ts`, `infras/compute.tf`, `infras/README.md`.

### Frontend: moderator and system-admin journeys

Owner: frontend

- Add a report action for threads and comments.
- Add a moderator-only society queue to list, claim, resolve, and dismiss reports.
- Add a system-admin route for creating societies and managing user status/roles.
- Gate each route and action from the authenticated role/membership data; backend authorization remains the source of truth.
- Include component tests for role-gating and mutation error states.

Relevant files: `web/src/app/routes.tsx`, `web/src/features/discussions/`, `web/src/pages/societies/`, `backend/src/modules/moderation/presentation/moderation.routes.ts`, `backend/src/modules/identity/presentation/identity.routes.ts`.

## P1: Needed for the Full Product Contract

### Backend: registration verification

Owner: backend + frontend

- Implement the product-specified email OTP flow: issue code, deliver email, verify code, then create the session.
- Add expiry, single-use, resend throttling, and audit data.
- Use a configurable RMIT domain allow-list. `ALLOWED_EMAIL_DOMAINS` is now environment-configurable, but deployment configuration still needs to provide the approved production list.

Relevant files: `web/PRODUCT.md`, `backend/src/modules/identity/`, `backend/.env.example`.

### Frontend: remaining supported management actions

Owner: frontend

- Add thread/comment edit and delete controls where authorized.
- Add society rule and moderator-membership management for society moderators.
- Add profile-avatar upload once S3 media is operational.
- Add a visible theme control if both light and dark modes are intended as user-selectable modes.
- Replace the remaining `r/{society}` thread-card label with society terminology.

### Full Stack: media access policy

Owner: backend + frontend

- Restrict resolved media URLs to `ready` media that is visible through accessible content, or to the owning user/authorized moderator.
- Define and test behavior for pending, quarantined, deleted, private-profile, and removed-content media.

Relevant files: `backend/src/modules/media/application/media.service.ts`, `backend/src/modules/media/presentation/media.controller.ts`.

## P1: AWS and Assessment Deliverables

Owner: infrastructure + documentation

- Implement an automated, user-visible AWS analytics workflow. Analytics is currently deferred but is required by the assessment.
- Create the required solution-architecture document: architecture diagrams, AWS service interactions, data/API design, security/cost decisions, live deployment evidence, teardown steps, and references.
- Use immutable ECR image tags and document the deployed version.
- Add a deployment smoke script covering the API Gateway HTTPS site, API health, database readiness, session authentication, S3 upload, and media retrieval.
- Resolve RDS TLS trust in the ECS image before a real deployment.
- Treat the public HTTP API origin as a demo risk until private origin connectivity/TLS is implemented.

Relevant files: `infras/`, `ASSESSMENT_3_S2-1.pdf`, `docs/`.

## P2: Quality and Maintenance

### Backend Tests

Owner: backend

- Add PostgreSQL integration tests for migrations, constraints, votes, report claims, pagination, and transaction rollback.
- Add identity controller tests for register/sign-in/session expiry/suspension/deactivation.
- Add media service and controller tests.

### Frontend Tests and Performance

Owner: frontend

- Add protected-route, return-location, sign-out failure, reporting/moderation, admin, and media-upload tests.
- Add a browser-level student-to-moderator workflow test.
- Split the production JavaScript bundle; Vite reports a 522.78 kB minified chunk.
- Investigate the `oxlint` out-of-memory termination and make lint a reliable CI gate.

### Documentation Cleanup

Owner: documentation

- Update `backend/README.md`, `web/README.md`, and `docs/HANDOFF_AUTH.md`; they describe implementation as deferred even where it now exists.

## Verification Baseline

Completed on 2026-08-02:

```sh
cd backend && pnpm typecheck && pnpm test
cd web && pnpm typecheck && pnpm test && pnpm build
```

Results: backend 23 tests passed; web 16 tests passed; web production build passed. `oxlint` still terminates abnormally, likely due to available memory, and remains an open quality-gate issue.
