# Cognito Exit and Authentication Migration Plan

- **Status:** Proposed
- **Owner:** TBD
- **Target provider:** TBD — must be approved before implementation
- **Scope:** Backend, web app, PostgreSQL schema, infrastructure, operations, tests, and product/deployment documentation
- **Migration strategy:** Incremental dual-provider transition; authorization remains application-owned

## 1. Objective

Replace Amazon Cognito without weakening institution verification, tenant isolation, role enforcement, account status controls, auditability, or availability.

Authentication answers **who the caller is**. PostgreSQL remains authoritative for **institution membership, role, account status, profile, and authorization**. Replacement-provider claims must never directly grant moderator or administrator access.

## 2. Constraints and non-goals

### Required constraints

- Preserve RMIT email eligibility and immutable `s<number>` handle derivation.
- Production users must verify email before receiving a usable forum session.
- Validate token signature, issuer, audience, expiry, and token type server-side.
- Use stable opaque provider subject IDs; never identify accounts by mutable email alone.
- Keep roles, status, and institution membership server-side in PostgreSQL.
- Preserve `Authorization: Bearer` API compatibility where practical.
- Never log passwords, tokens, verification codes, email addresses, raw claims, or session cookies.
- Support key rotation, token revocation/session termination, rate limits, and account deactivation.
- Avoid destructive cutover. Retain rollback until migration acceptance criteria pass.
- Do not add a provider, cloud, database, or infrastructure framework without explicit approval.

### Non-goals

- Redesigning forum permissions or role taxonomy.
- Adding social login, anonymous access, multi-institution membership, or passwordless login unless separately approved.
- Trusting frontend route guards or external-provider role claims for authorization.
- Migrating unrelated CloudPulse/DDD work.

## 3. Current-state inventory

Known Cognito coupling:

- `backend/src/rmit_society/auth/jwt.py` — Cognito RS256/JWKS verifier and Cognito-specific claim parsing.
- `backend/src/rmit_society/identity/api.py` — direct Cognito sign-up, confirmation, and password sign-in via boto3.
- `backend/src/rmit_society/auth/claims.py` and `auth/dependencies.py` — `cognito_username` naming and Cognito OpenAPI description.
- `backend/src/rmit_society/identity/application.py` — profile creation/resolution by Cognito subject.
- `backend/src/rmit_society/identity/domain.py` — public `User.cognito_sub` field.
- Repository adapters/interfaces and baseline Alembic schema — `cognito_sub`, `cognito_links`, and related indexes.
- `apps/web/src/auth/auth-provider.tsx` — password registration, confirmation-code flow, bearer token lifecycle.
- `apps/web/src/lib/api/endpoints.ts` and API types — current auth contract and `cognito_sub` exposure.
- Login UI — Cognito-specific copy.
- Backend/frontend tests — Cognito stubs, claims, and fixtures.
- `.env.example`, API description, `PRODUCT.md`, `README.md`, and `AGENTS.md` — Cognito configuration and architecture claims.

Before implementation, rerun repository-wide case-insensitive search for `cognito`, `user_pool`, `jwks`, `access_token`, and `cognito_sub`; current DDD refactor may move files.

## 4. Decision gate: select replacement

No implementation beyond provider-neutral refactoring starts until an ADR approves replacement design.

Evaluate candidates against:

1. RMIT email verification and domain restrictions.
2. Standards support: OIDC/OAuth 2.0, Authorization Code + PKCE, documented discovery/JWKS, refresh rotation, logout/revocation.
3. Administrative account recovery, suspension, MFA, audit logs, and breach response.
4. Data residency, privacy terms, export/deletion, vendor lock-in, and user migration support.
5. SPA and FastAPI integration quality without exposing client secrets.
6. Availability, key-rotation behavior, rate limits, operational burden, and cost under assessment/demo load.
7. Local deterministic testing without external calls.
8. AWS deployment/network compatibility and assessment implications.

ADR must decide:

- Hosted OIDC provider versus application-owned credentials/sessions.
- Redirect/PKCE flow versus backend-for-frontend secure cookie flow.
- Access/refresh token storage and CSRF protections.
- Existing-user migration method: provider import, first-login linking, forced password reset, or no migration if no real users exist.
- MFA and recovery policy.
- Account deletion and identity-link retention.
- Cutover and rollback windows.

**Preferred default:** standards-based OIDC with Authorization Code + PKCE or a backend-for-frontend session. Do not reproduce a password identity provider inside FastAPI unless explicitly approved with a security review.

## 5. Target architecture

### Provider-neutral boundary

Introduce interfaces owned by the identity context:

- `TokenVerifier.verify(token) -> ExternalIdentity`
- `IdentityProvider.start_sign_in(...)`, callback/exchange, refresh, sign-out, registration/verification functions as required by selected flow
- Provider adapter contains issuer-specific claim mapping and SDK/HTTP errors.
- Application services consume normalized identity values only.

Normalized identity:

- `issuer`: canonical provider issuer
- `subject`: immutable provider subject
- `email_verified`: boolean
- `email` or derived handle input only where registration/linking requires it; do not retain it in request context unnecessarily
- Provider session/token metadata needed for expiry/revocation, excluding secrets

### Application-owned authorization

On each protected request:

1. Validate credential/session cryptographically.
2. Resolve `(issuer, subject)` to internal `user_id`.
3. Load current PostgreSQL user/membership.
4. reject missing, suspended, deactivated, unverified, or wrong-tenant identities.
5. Build request-scoped authorization context from database role/status/institution.

External claims may identify user but cannot elevate role, change institution, or reactivate account.

### Data model

Replace provider-specific links with generic external identities:

```text
external_identities
- issuer                 text, not null
- subject                text, not null
- user_id                text, not null, FK users
- email_verified_at      timestamptz, nullable
- linked_at              timestamptz, not null
- last_authenticated_at  timestamptz, nullable
- disabled_at            timestamptz, nullable
PK (issuer, subject)
INDEX (user_id)
```

Remove `users.cognito_sub` only after all reads use `external_identities` and cutover is complete. Do not expose external subject IDs in ordinary `User` API responses.

Migration must be additive first:

1. Add `external_identities` and repository methods.
2. Backfill Cognito links as `(legacy Cognito issuer, cognito_sub, user_id)`.
3. Dual-read generic link first, legacy link only as temporary fallback.
4. Link replacement identity after secure ownership proof.
5. Stop legacy writes.
6. Remove fallback after observation window.
7. Drop Cognito columns/table in a later reversible Alembic revision after backup and explicit approval.

## 6. Delivery phases

### Phase 0 — Discovery and decisions

- [ ] Confirm replacement provider and migration population: no users, synthetic users, or real users.
- [ ] Inventory deployed dev/prod Cognito pools, clients, callback URLs, users, and dependencies without exporting secrets.
- [ ] Record current auth API/OpenAPI contract and frontend journeys.
- [ ] Create ADR covering provider, browser flow, token/session storage, account migration, MFA/recovery, and rollback.
- [ ] Threat-model registration, account linking, token theft, CSRF, replay, session fixation, email change, and admin elevation.
- [ ] Define measurable rollout and rollback criteria.

**Exit:** provider and security design approved; migration population and data handling known.

### Phase 1 — Decouple domain and persistence

- [ ] Rename normalized claim `cognito_username` to provider-neutral verified identity/email data.
- [ ] Add `ExternalIdentity` domain model and generic repository interface.
- [ ] Add additive Alembic migration and adapters for PostgreSQL plus any still-supported test/legacy repository.
- [ ] Backfill legacy Cognito links idempotently; report counts and conflicts without logging subjects/emails.
- [ ] Resolve profiles by `(issuer, subject)` while preserving server-owned authorization.
- [ ] Remove external subject from public `User` response; update frontend types and fixtures.
- [ ] Add tests for duplicate links, one external identity linked to two users, missing links, provider subject collision across issuers, and tenant/status enforcement.

**Exit:** existing Cognito flow still works entirely through provider-neutral domain/repository interfaces.

### Phase 2 — Add replacement adapter and backend flow

- [ ] Implement selected provider adapter behind interfaces.
- [ ] Validate discovery/JWKS over HTTPS, allowed algorithms, issuer, audience, expiry/not-before, token use, and required verified-email signal.
- [ ] Handle JWKS caching and unknown-key refresh with bounded timeout; fail closed during invalid/unavailable verification.
- [ ] Implement registration, verification, sign-in/callback, refresh, sign-out/revocation, recovery, and deactivation contracts required by ADR.
- [ ] Enforce RMIT email/handle rules server-side before profile creation/linking.
- [ ] Make registration/profile creation idempotent across provider success, callback retry, and database failure.
- [ ] Map provider failures to stable API errors without provider internals.
- [ ] Rate-limit sign-up, sign-in, confirmation/callback, recovery, refresh, and linking endpoints.
- [ ] Add structured metrics for success/failure code, latency, issuer, and correlation ID only.

**Exit:** replacement auth passes backend unit/API tests with deterministic fakes; no test calls live provider.

### Phase 3 — Frontend migration

- [ ] Replace Cognito-specific endpoint calls and copy with selected redirect/callback or session flow.
- [ ] Centralize token/session handling; avoid persistent JavaScript-readable refresh tokens. If bearer tokens remain, keep access tokens short-lived and define safe refresh behavior.
- [ ] Add callback, verification-pending, expired-session, recovery, account-link conflict, and provider-unavailable states.
- [ ] Preserve post-login `/me/bootstrap` behavior without optimistic authorization.
- [ ] Ensure sign-out clears local state and revokes/ends provider session where supported.
- [ ] Test keyboard operation, focus movement, accessible errors, loading states, and reduced motion.
- [ ] Test refresh, multi-tab sign-out, expired credentials, callback replay, and interrupted registration.

**Exit:** core auth journey works against replacement provider in isolated dev; no Cognito branding or direct calls remain in web app.

### Phase 4 — Dual-provider rollout and user linking

- [ ] Deploy additive schema and provider-neutral code before enabling replacement flow.
- [ ] Enable replacement authentication only for staff/test cohort in `dev`.
- [ ] Reconcile each migrated identity to exactly one existing internal `user_id`; never create duplicate forum profiles silently.
- [ ] Require strong ownership proof for first-login linking. Email match alone is insufficient if account takeover risk exists.
- [ ] Keep legacy Cognito verification available during bounded transition if real users require migration.
- [ ] Monitor auth success, link conflicts, unauthorized/forbidden rates, token validation failures, latency, and support incidents.
- [ ] Expand cohort only after tenant-boundary, role, suspension, and deactivation checks pass.
- [ ] Announce forced reset/re-authentication and support path if required.

**Exit:** agreed migration percentage reached, no unresolved identity collisions, authorization/security metrics within baseline.

### Phase 5 — Cutover and Cognito retirement

- [ ] Make replacement provider sole path for new registrations.
- [ ] Disable Cognito sign-in only after rollback checkpoint and migration acceptance.
- [ ] Remove Cognito boto3 calls, verifier, settings, IAM permissions, frontend copy, tests, and provider modules.
- [ ] Remove legacy auth endpoints only through a versioned/deprecation-compatible API change.
- [ ] Update OpenAPI security descriptions and generated/reference docs.
- [ ] Update `PRODUCT.md`, `README.md`, `.env.example`, deployment architecture, runbooks, and repository instructions.
- [ ] Stop claiming Cognito as an application-used AWS service in assessment evidence.
- [ ] Export only legally/operationally required audit metadata, define retention, then delete Cognito users/pool through explicit destructive-change approval.
- [ ] Drop legacy database fields/tables only after backup, retention approval, and rollback window expiration.

**Exit:** repository and deployed runtime have no Cognito dependency; provider inventory and documentation agree.

## 7. Test matrix

### Token/session validation

- Valid credential; expired/not-yet-valid credential; wrong issuer/audience/token type.
- Disallowed algorithm, malformed token, bad signature, missing subject, unverified email.
- Unknown/rotated key, stale cache, JWKS timeout/malformed response.
- Revoked/ended session where provider semantics support it.

### Registration and linking

- Eligible RMIT domains and invalid lookalike/subdomain cases.
- Immutable handle derivation and duplicate registration.
- Callback/retry idempotency and partial provider/database failure.
- Existing identity, missing profile, link conflict, issuer+subject collision.
- Email change at provider does not silently change handle or link another account.

### Authorization

- Unauthorized, suspended, deactivated, wrong tenant, regular user, moderator, institution admin, platform admin.
- Provider-supplied role/institution claims cannot elevate database authorization.
- Every protected API retains server-side checks; public auth/docs/health routes remain intentional.

### Frontend and end-to-end

- Sign-up, verification, sign-in, refresh/session restore, sign-out, recovery, deactivation.
- Error/loading/accessibility states and callback replay.
- Migrated-user first login and rollback to legacy during transition.
- Cross-tenant smoke tests after each deployment stage.

## 8. Operations, rollout, and rollback

### Observability

Create dashboards/alerts for:

- Authentication attempts and success rate by provider and non-sensitive error code.
- Verification/link conflicts and duplicate-profile prevention.
- Token validation/JWKS failures and p95 latency.
- 401/403 changes by endpoint; never treat expected 403 as provider failure.
- Recovery/rate-limit events and suspicious bursts.

Do not log tokens, cookies, passwords, codes, email, provider payloads, or external subject IDs.

### Rollback

- Keep schema additive and Cognito identities intact through observation window.
- Feature-flag provider entry points and accepted issuers by environment.
- Roll back frontend entry point and accepted provider independently where API compatibility allows.
- Never unlink replacement identities or delete Cognito resources during rollback.
- If identity mapping integrity is uncertain, fail closed and pause rollout rather than creating accounts.

Rollback triggers include material login failure increase, identity collision, authorization regression, cross-tenant exposure, unverifiable key rotation, or inability to deactivate/revoke sessions.

## 9. Acceptance criteria

- Replacement provider and flow have approved ADR and threat model.
- 100% of active migrated accounts map to exactly one internal user; zero unresolved collisions.
- Cross-tenant, role, suspension, and deactivation suites pass.
- No provider role/tenant claim is authoritative.
- Registration remains idempotent and restricted to approved RMIT identities.
- Token/session security, key rotation, recovery, logout, and rate limits pass tests.
- Frontend core flows meet WCAG 2.1 AA checks.
- Local automated tests use deterministic fakes and no paid/live provider calls.
- Dev smoke tests pass before production cutover.
- Cognito code, settings, IAM, infrastructure, schema, UI copy, and documentation are removed only after rollback window.
- Product and assessment architecture no longer claim Cognito.

## 10. Proposed change order

1. ADR and threat model.
2. Generic identity schema/repository and compatibility adapter.
3. Provider-neutral claims and authorization context.
4. Replacement backend adapter and auth contracts.
5. Frontend flow and accessibility states.
6. Dev cohort rollout and identity reconciliation.
7. Production dual-provider migration, if needed.
8. Replacement-only cutover.
9. Cognito decommission and delayed schema cleanup.

Each pull request should be independently deployable, include focused tests, and avoid mixing current DDD restructuring with auth migration unless file movement makes separation impossible.
