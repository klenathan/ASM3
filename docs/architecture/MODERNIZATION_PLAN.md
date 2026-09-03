# Repository modernization plan

Status: proposed execution plan  
Baseline: `59d3eb6` (`Fix analytics pipeline and simplify module`)

## Purpose

Reduce legacy code and documentation drift without changing the product boundary:

- Keep the Vite/React frontend as a single-page application.
- Move only frontend hosting from Amplify to Elastic Beanstalk.
- Keep the Hono backend, ECS deployment, API Gateway, RDS, S3, SQS, Lambda, Glue, and Athena responsibilities intact.
- Preserve the assessment evidence and historical database migration chain.
- Remove code only when repository references and runtime entrypoints prove it is unused.

This plan is intentionally staged. The hosting cutover must precede deletion of Amplify resources, and dead-code deletion must precede dependency pruning.

## What is already complete

### Architecture and application structure

- The backend follows the accepted domain-oriented modular-monolith design in `docs/backend-architecture/BACKEND_ARCHITECTURE.md`.
- Backend dependency flow is established as route → controller → service → repository port → infrastructure adapter.
- Identity, societies, discussions, moderation, media, operations, content analysis, and analytics modules exist in the repository.
- React Router, TanStack Query, the existing feature structure, shadcn/ui primitives, and the red-orange design tokens are active frontend conventions.

### Analytics cutover

The analytics refactor is already committed in the baseline commit:

- The legacy `analytics_metrics` table is removed from the active schema.
- Migration `backend/drizzle/0022_omniscient_bloodscream.sql` records the forward database change.
- The current analytics path uses refresh runs and the v2 API rather than the deleted snapshot repository/catalog implementation.
- Deterministic analytics demo seeding and Lambda deployment scripts are present.
- Historical migrations and generated snapshots remain available for reproducible migration history.

Do not recreate the deleted analytics source files, and do not delete historical migration files.

### Product flows already implemented

- Authentication and session handling.
- Society, thread, comment, voting, reporting, moderation, and media flows.
- Admin guard, admin route, admin page, health/config/audit/analytics sections.
- Content-analysis execution and moderation/reanalysis routes under the discussions presentation layer.
- Analytics refresh and reporting integration across Lambda, Glue/Athena, backend, and frontend code.

### Audit work completed for this plan

- Repository entrypoints and deployment scripts were traced.
- Backend and frontend import graphs were checked.
- Amplify references were traced through Terraform, outputs, deployment scripts, Make targets, CORS, and documentation.
- Unregistered content-analysis presentation stubs were identified.
- Unreachable frontend UI primitives and unused hooks were identified.
- Broken documentation references and stale “phase one” descriptions were identified.
- Historical migration files were separated from removable runtime legacy.

## What remains

## Phase 1 — Replace Amplify hosting

Priority: blocking  
Owner boundary: `infras/`, `scripts/`, `web/`, deployment documentation

### Work

- Add an Elastic Beanstalk application and environment using the pre-created Learner Lab roles and supported instance sizes.
- Add a small Node static server for `web/dist`.
- Serve `index.html` for client-side route fallback.
- Reverse-proxy `/api/*` from Elastic Beanstalk to API Gateway.
- Keep browser API requests same-origin so the current session-cookie behavior remains valid.
- Replace `local.web_origin` with the Elastic Beanstalk origin.
- Update S3 media CORS to include the new origin.
- Replace Amplify outputs with Elastic Beanstalk URL/environment outputs.
- Rewrite `scripts/deploy-frontend.sh` to build and deploy the frontend package to Elastic Beanstalk.
- Update the `Makefile` deployment target and help text.
- Remove `infras/amplify.tf` only after the replacement path works.

### Acceptance criteria

- The production hostname serves the React application.
- Refreshing a deep link such as `/admin` returns the SPA instead of a 404.
- Login, logout, session refresh, suspension handling, and authenticated API calls work through the EB hostname.
- `/api/*` reaches API Gateway and then the existing ECS backend.
- S3 media upload requests pass CORS validation.
- No active Terraform, script, Makefile, or application configuration depends on Amplify.

### Constraints

- Do not replace API Gateway, ECS, RDS, or the backend with a new architecture.
- Do not introduce CloudFront; it is unavailable in the active Learner Lab.
- Reuse `LabRole` and `LabInstanceProfile`; do not create IAM users, groups, or custom roles.
- Keep resources in `us-east-1` unless the active lab configuration explicitly requires `us-west-2`.

## Phase 2 — Remove proven dead backend code

Priority: high  
Owner boundary: `backend/src/modules/content-analysis/`

### Remove

- `backend/src/modules/content-analysis/presentation/content-analysis.controller.ts`
- `backend/src/modules/content-analysis/presentation/content-analysis.routes.ts`
- `backend/src/modules/content-analysis/presentation/content-analysis.schemas.ts`

These files are not registered by `app.ts`; the controller throws `not implemented`, and the routes contain only a placeholder mount. The active analysis endpoints already exist in `backend/src/modules/discussions/presentation/discussion.routes.ts`.

Also remove from `content-analysis.policy.ts` and its focused tests:

- `ThreadAnalysisOutcome`.
- `outcomeForDecision`.
- `outcomeForFailure`.
- Stale Phase-3 and `pending_review` comments.

### Retain

- Content-analysis application services.
- Domain policy used by the active flow.
- Infrastructure adapters and Lambda handlers.
- SQS/event contracts and automatic-thread-removal implementation.

### Acceptance criteria

- Backend build and focused content-analysis tests pass.
- Active analysis, reanalysis, moderation decision, and automatic-removal routes remain unchanged.
- No imports or route registrations reference the deleted presentation files.

## Phase 3 — Remove unreachable frontend surface

Priority: high  
Owner boundary: `web/src/`

### Remove the unused UI component closure

Delete the 40 unreachable generated primitives under `web/src/components/ui/`:

`accordion`, `aspect-ratio`, `attachment`, `breadcrumb`, `bubble`, `button-group`, `calendar`, `chart`, `checkbox`, `collapsible`, `combobox`, `command`, `context-menu`, `direction`, `drawer`, `empty`, `field`, `hover-card`, `input-group`, `input-otp`, `item`, `kbd`, `marker`, `menubar`, `message-scroller`, `message`, `native-select`, `navigation-menu`, `pagination`, `popover`, `progress`, `radio-group`, `resizable`, `scroll-area`, `separator`, `sheet`, `sidebar`, `slider`, `toggle-group`, and `toggle`.

The active 20 UI primitives remain. Re-add a primitive only when a real feature imports it.

### Remove unused hooks

- `web/src/features/location/use-places-search.ts` — no consumers; the active location input owns its search behavior.
- `web/src/hooks/use-mobile.ts` — only imported by the deleted sidebar primitive.

### Prune dependencies

After source deletion, remove frontend dependencies proven to be used only by the deleted primitives:

- `@base-ui/react`
- `@shadcn/react`
- `cmdk`
- `date-fns`
- `input-otp`
- `react-day-picker`
- `react-resizable-panels`
- `recharts`
- `vaul`

Keep `shadcn`, `tw-animate-css`, and `@tanstack/markdown` because active CSS or application code uses them.

### Acceptance criteria

- Frontend typecheck, tests, and production build pass.
- No active feature imports a deleted primitive or hook.
- The lockfile contains no dependency that is unused after the cleanup.
- Existing admin, analytics, discussion, auth, and location screens render unchanged.

## Phase 4 — Consolidate duplicated application utilities

Priority: medium

### HTTP client

Make `web/src/lib/http.ts` the single HTTP client. Refactor `web/src/features/auth/api.ts` to use it and preserve the `details.suspendedUntil` error data consumed by `SignInPage.tsx`.

Do not change authentication semantics, credentials mode, API URL handling, or error response shape without a focused contract test.

### Email-domain configuration

Resolve the duplicated defaults in:

- `backend/src/config/email-domains.ts`.
- `backend/src/modules/platform/domain/platform.ts`.
- `backend/.env.example`.

Confirm the approved AU, VN, and EU RMIT domain allow-list before making it a runtime default. Until confirmed, fail closed rather than silently expanding registration eligibility. Keep one runtime source of truth and make the example configuration match it.

### Admin pending scaffolding

All current admin sections have `pending: false`. After confirming that future admin tabs are not part of the current scope, remove:

- `AdminSection.pending`.
- Pending branches in `AdminPage.tsx` and `admin-nav.tsx`.
- `web/src/features/admin/pending-section.tsx`.

Do not remove the separate pending settings sections; those represent a different page state.

## Phase 5 — Update documentation and architecture evidence

Priority: medium  
Documentation must describe the implemented system, not the initial scaffold.

### Rewrite

- `web/README.md`: remove the foundation-only description and missing `docs/HANDOFF_AUTH.md` link.
- `backend/README.md`: remove deferred phase-one claims and replace the Amplify deployment path.
- `PRODUCT.md`: mark analytics as implemented and replace Amplify hosting.
- `AGENTS.md`: update the confirmed frontend hosting decision to Elastic Beanstalk.
- `infras/README.md`: remove the obsolete analytics migration-preflight instructions and describe EB deployment.
- `infras/LEARNER_LAB_SERVICES.md`: record EB as the selected available hosting alternative instead of leaving the replacement undecided.
- `docs/caching/BACKEND_CACHING_RESEARCH.md`: replace Amplify-specific cache/proxy assumptions with the EB Node proxy model.
- `docs/admin-center/ADMIN_CENTER_PLAN.md`: separate implemented sections from remaining roadmap items.
- `docs/content-analysis/LAMBDA_OPENROUTER_CONTENT_ANALYSIS_PLAN.md`: mark implemented work and retain only genuinely deferred work.

### Fix references

- Correct the backend architecture link in `docs/content-analysis/LAMBDA_OPENROUTER_CONTENT_ANALYSIS_PLAN.md`.
- Correct the missing SQS companion-plan reference in `docs/content-analysis/SQS_THREAD_AUDIT_GUIDE.md`.
- Correct content-analysis and SQS paths in `docs/automatic-thread-removal/BACKLOG.md`.
- Correct the companion-document label in the content-analysis Excalidraw diagram.

### Architecture diagrams

- Update `docs/architecture/architecture-overview.excalidraw` and its PNG to show Elastic Beanstalk and the `/api` proxy.
- Confirm that diagram as the canonical assessment architecture artifact.
- Then remove the unreferenced, Amplify-based duplicate `infras/aws-infrastructure-highlevel.excalidraw`.

## Phase 6 — Verification and operational closure

Priority: required before declaring modernization complete

### Static and build checks

- Search for active Amplify references after the hosting cutover.
- Search for deleted content-analysis presentation imports.
- Search for deleted UI primitive and hook imports.
- Run frontend typecheck, tests, and build.
- Run backend typecheck, tests, and build.
- Run `tofu validate` and inspect the plan without applying infrastructure during review.
- Validate that the migration journal and generated snapshot are internally consistent.

### Runtime smoke checks

- Anonymous homepage and direct route navigation.
- Registration eligibility and authentication.
- Session-backed API request through the EB `/api` proxy.
- Logout and suspended-user response handling.
- Society/thread/comment/vote flow.
- S3 media upload and retrieval.
- Moderator and system-admin authorization boundaries.
- Analytics refresh, status, table, chart, and tooltip behavior.
- Lambda/Glue/Athena invocation evidence required by the assessment.

### Cost and teardown

- Use the smallest supported EB/EC2/RDS footprint.
- Stop or destroy demo resources after assessment use.
- Do not treat delayed Learner Lab budget data as proof that a resource is cost-free.
- Record the exact teardown command/path in infrastructure documentation.

## Explicit non-goals

- No migration from the modular monolith to microservices.
- No replacement of API Gateway, ECS, RDS, S3, Lambda, Glue, or Athena.
- No deletion of historical migrations or generated migration metadata.
- No redesign of the React application into another framework.
- No new authentication layer, state-management library, or UI kit.
- No analytics service expansion until its product purpose and demo path are defined.

## Completion definition

Modernization is complete when the EB-hosted SPA works end-to-end through the existing backend path, Amplify is absent from active infrastructure and deployment code, proven dead code and dependencies are removed, configuration has one source of truth, documentation and diagrams match the implementation, and the focused build/runtime checks pass.
