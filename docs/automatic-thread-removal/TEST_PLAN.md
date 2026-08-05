# Automatic Thread Removal Test Plan

## 1. Test objective

Prove that automatic enforcement is narrow, reversible, globally applied,
race-safe, auditable, and disabled outside `enforce` mode.

## 2. Domain policy tests

Target:
`backend/src/modules/content-analysis/domain/content-analysis.policy.test.ts`

| Case | Expected result |
| --- | --- |
| `review`, one `high` finding at `0.90` | matches |
| `review`, one `high` finding at `0.95` | matches |
| `review`, one `high` finding at `0.899999` | does not match |
| `review`, one `medium` finding at `0.99` | does not match |
| `review`, one `low` finding at `1.0` | does not match |
| `allow`, one `high` finding at `1.0` | does not match |
| `review`, no findings | does not match |
| `review`, high match plus unrelated findings | matches |
| custom threshold `0.95`, finding `0.90` | does not match |
| custom threshold `0.80`, finding `0.90` | matches |

Also verify the predicate has no side effects and does not mutate the analysis
result.

## 3. Configuration tests

Target: `backend/src/config/`

- Missing threshold resolves to `0.90`.
- String environment values are parsed as numbers according to existing config
  conventions.
- `-0.01` fails validation.
- `1.01` fails validation.
- Non-numeric values fail validation.
- `off` and `shadow` remain valid modes.
- Infrastructure variables pass the configured value to the task definition.

## 4. Context and service tests

Target:
`backend/src/modules/content-analysis/application/content-analysis.service.test.ts`

Use fakes for the analyzer, analysis repository, context port, clock, logger,
automated-removal port, and audit publisher.

Required cases:

1. `enforce + review + high/0.90 + published` calls removal once and publishes
   one audit event.
2. `enforce + review + high/0.899999` does not remove.
3. `enforce + review + medium/0.99` does not remove.
4. `enforce + allow + high/1.0` does not remove.
5. `shadow + review + high/1.0` does not remove or publish an auto-removal
   event.
6. `off` does not create or execute analysis as today.
7. Context status `removed` skips enforcement.
8. Context status `deleted` skips enforcement.
9. The atomic port returns `already_inactive`; no event is published.
10. Reanalysis uses the same predicate and enforcement path.
11. A successful analysis remains successful if audit publication fails.
12. Analysis invocation failure leaves thread status unchanged.
13. Repeated execution of the same run cannot publish duplicate removal events.

## 5. Discussions repository tests

Target:
`backend/src/modules/discussions/infrastructure/` integration tests and
discussion service tests.

Use PostgreSQL integration coverage for:

- published thread updated to removed;
- removed thread update affects zero rows;
- deleted thread update affects zero rows;
- `updated_at` changes on a successful transition;
- a concurrent second transition is a no-op;
- thread body remains intact for `removed` and remains null for `deleted`.

The integration test must exercise the actual SQL condition, not only a fake
repository.

## 6. Audit publisher tests

Target:
`backend/src/modules/discussions/infrastructure/`
publisher tests and event-port tests.

Verify:

- event type and version are correct;
- stable event ID is derived from the analysis run ID;
- required message attributes are present;
- JSON body contains no thread body, image bytes, email, or unrestricted model
  transcript;
- send failures are logged using IDs only;
- no-op publisher works when SQS is not configured.

## 7. Audit consumer tests

Target:
`backend/src/modules/audit/application/audit-events.consumer.test.ts`

Verify:

- valid `thread.auto_removed` is persisted and acknowledged;
- invalid UUID is rejected and left unacknowledged;
- invalid event type/version is rejected;
- confidence below threshold is rejected;
- non-high severity is rejected;
- repository failure leaves the message unacknowledged;
- duplicate source ID is acknowledged without a second row;
- existing `thread.created` behavior is unchanged.

## 8. Restore tests

Target:
`backend/src/modules/discussions/application/discussion.service.test.ts` and
frontend analysis action tests.

Verify:

- system admin can Accept an auto-removed thread;
- a society moderator can Accept within the society;
- a moderator from another society is rejected;
- a plain member is rejected;
- Accept changes `removed -> published`;
- Accept records a human override;
- the automatic audit row remains present;
- Reject remains idempotent and does not create a second automatic event.

## 9. End-to-end evidence test

With analysis enabled and a deterministic fake/stub analyzer or approved test
fixture:

1. Create a published test thread.
2. Return `review` with one `high` finding at `0.97`.
3. Confirm a successful analysis run.
4. Confirm the thread status is `removed`.
5. Confirm one `thread.auto_removed` message is sent.
6. Confirm the audit consumer records one row.
7. Open the retained thread as a moderator.
8. Use Accept.
9. Confirm the status is `published` and the human override exists.
10. Confirm the automatic audit row remains unchanged.

Capture thread ID, run ID, event ID, message ID, audit row ID, and timestamps as
demo evidence. Do not capture or commit user content or secrets.

## 10. Required command verification

Run from `backend/`:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Run from `web/` if frontend files change:

```bash
pnpm typecheck
pnpm lint
pnpm build
```

Run the PostgreSQL integration tests only with an approved local/test database
configured through `DATABASE_URL`. Do not commit credentials or `.env`
contents.
