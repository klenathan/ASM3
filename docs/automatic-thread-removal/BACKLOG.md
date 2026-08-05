# Automatic Thread Removal Backlog

Status: proposed implementation backlog  
Owner: backend/content-analysis team  
Primary scope: `backend/`, `infras/`, and focused frontend regression work  
Related systems: content analysis, discussions, audit events, SQS reanalysis

## 1. Product contract

### Trigger

An eligible analysis result triggers automatic removal when:

```text
mode = enforce
AND decision = review
AND exists finding where severity = high AND confidence >= 0.90
AND current thread status = published
```

The threshold is inclusive. A confidence of exactly `0.90` qualifies.

### Outcomes

| Analysis result                     | Current status | Outcome                                          |
| ----------------------------------- | -------------- | ------------------------------------------------ |
| `allow`                             | `published`    | Remains published                                |
| `review` without a matching finding | `published`    | Remains published and appears in review workflow |
| `review` with a matching finding    | `published`    | Changes to `removed`, publishes audit event      |
| Any result                          | `removed`      | No status change and no second removal event     |
| Any result                          | `deleted`      | No status change and no removal event            |

The common analysis-success path must enforce this for both new-thread analysis
and reanalysis. The SQS worker itself remains responsible for job transport;
the content-analysis service remains responsible for the use case.

## 2. Backlog priorities

- **P0** - required before enabling automatic removal in `enforce` mode.
- **P1** - required before calling the feature complete for the coursework
  deployment.
- **P2** - useful hardening or follow-up, not required for the first release.

## 3. Epic A: Domain policy and configuration

### ATR-001 - Add the automatic-removal predicate

Priority: P0  
Dependencies: none  
Target files:

- `backend/src/modules/content-analysis/domain/content-analysis.policy.ts`
- `backend/src/modules/content-analysis/domain/content-analysis.policy.test.ts`

Tasks:

- Add a named default threshold constant set to `0.90`.
- Add a pure predicate that accepts an analysis result and configured threshold.
- Require `decision === "review"`.
- Match at least one finding with `severity === "high"` and
  `confidence >= threshold`.
- Do not use sentiment, vote counts, popularity, or the number of findings as
  part of this predicate.
- Keep the predicate framework-free and independent of Drizzle, Hono, AWS, or
  PostgreSQL types.

Acceptance criteria:

- One matching finding returns `true` even when other findings are lower
  severity.
- A confidence of `0.90` returns `true`.
- A confidence of `0.899999` returns `false`.
- `medium` and `low` severity never match.
- `allow` never matches, even if a high-confidence high-severity finding is
  present.
- Empty findings return `false`.

### ATR-002 - Add configurable threshold validation

Priority: P0  
Dependencies: ATR-001  
Target files:

- `backend/src/config/env.ts`
- `.env.example`
- `backend/.env.example` if backend-specific variables are documented there
- `infras/variables.tf`
- `infras/compute.tf`
- `infras/terraform.tfvars.example`
- `docs/LAMBDA_OPENROUTER_CONTENT_ANALYSIS_PLAN.md`

Tasks:

- Add `CONTENT_ANALYSIS_AUTO_REMOVE_CONFIDENCE`.
- Default it to `0.90`.
- Validate the value is numeric and within `[0, 1]`.
- Pass it to the ECS backend task through infrastructure configuration.
- Preserve `CONTENT_ANALYSIS_MODE=off` as the local default.
- Document that the setting has no effect in `off` or `shadow` mode.
- Decide whether an invalid threshold fails startup, following the existing
  fail-closed configuration behavior.

Acceptance criteria:

- The parsed config exposes the threshold as a number.
- Missing configuration resolves to `0.90`.
- Values below `0` or above `1` fail validation.
- Terraform can configure the value without adding a new AWS service or IAM
  role.

### ATR-003 - Record policy-version compatibility

Priority: P1  
Dependencies: ATR-001, ATR-002  
Target files:

- `backend/src/config/env.ts`
- content-analysis deployment documentation
- existing analysis policy/version tests

Tasks:

- Bump the content-analysis policy version when the enforcement predicate is
  released.
- Persist the policy version on the analysis run as today.
- Include the configured threshold in operational configuration, not in the
  model response contract.
- Confirm that policy-version changes are visible to moderators and audit
  operators.

Acceptance criteria:

- Every automatic removal can be traced to the policy version and threshold
  used at the time of enforcement.

## 4. Epic B: Active-thread enforcement

### ATR-004 - Extend the analysis context with current status

Priority: P0  
Dependencies: none  
Target files:

- `backend/src/modules/content-analysis/application/thread-analysis-context.port.ts`
- `backend/src/modules/content-analysis/infrastructure/thread-analysis-context.ts`
- `backend/src/server.ts`
- related context adapter tests

Tasks:

- Add the thread status to the context returned by the context port.
- Add any identity fields needed to construct the audit event, preferably by
  returning a minimal thread snapshot rather than exposing a full discussion
  record.
- Update the composition-root `findThread` adapter mapping.
- Keep deleted thread bodies unavailable to analysis where the current context
  contract already treats them as absent.

Acceptance criteria:

- The service can tell whether the thread was `published`, `removed`, or
  `deleted` when context is loaded.
- The content-analysis module still depends only on its context port.

### ATR-005 - Add an explicit automated enforcement port

Priority: P0  
Dependencies: ATR-004  
Target files:

- `backend/src/modules/content-analysis/application/`
- `backend/src/server.ts`
- discussions public module surface or adapter tests

Tasks:

- Define a framework-neutral port for removing a thread only if it is still
  published.
- The port input must include the thread ID, analysis run ID, and removal
  reason code.
- The port result must distinguish `removed` from `already_inactive`.
- Implement the adapter at the composition root or through the Discussions
  module's public application surface.
- Do not import the Discussions repository or tables into content-analysis
  domain code.

Acceptance criteria:

- Content analysis can request automatic removal without knowing Drizzle or
  PostgreSQL details.
- A no-op result is returned when the thread is already removed or deleted.
- The port is straightforward to fake in service tests.

### ATR-006 - Implement an atomic `published -> removed` transition

Priority: P0  
Dependencies: ATR-005  
Target files:

- `backend/src/modules/discussions/application/discussion.repository.ts`
- `backend/src/modules/discussions/infrastructure/drizzle-discussion.repository.ts`
- `backend/src/modules/discussions/application/` service or public module
- PostgreSQL repository integration tests

Tasks:

- Add a domain-named repository operation such as
  `removePublishedThreadIfActive`.
- Implement the update with a `WHERE status = 'published'` guard.
- Return the affected thread snapshot needed by the audit event, or load it
  inside the same transaction/operation.
- Preserve `deleted` as an irreversible soft-delete state.
- Preserve the existing human `reject` and report-removal paths.

Acceptance criteria:

- A published thread becomes removed exactly once.
- An already removed thread is not updated and does not produce a duplicate
  automatic-removal result.
- A deleted thread is not updated.
- The method is safe if a human moderator acts while analysis is completing.
- Existing status constraints and timestamps remain valid.

### ATR-007 - Enforce after successful analysis persistence

Priority: P0  
Dependencies: ATR-001, ATR-005, ATR-006  
Target files:

- `backend/src/modules/content-analysis/application/content-analysis.service.ts`
- `backend/src/modules/content-analysis/application/content-analysis.service.test.ts`

Tasks:

- Keep the existing sequence that validates and persists a successful analysis
  run.
- After persistence, evaluate the automatic-removal predicate.
- Check the loaded status before attempting enforcement.
- Use the atomic repository operation as the final authority because context
  may become stale while the analyzer is running.
- Only emit the automatic-removal event when the transition actually changes
  the thread from published to removed.
- Leave non-matching `review` results in the existing moderation queue.
- Keep `off` and `shadow` behavior non-destructive.

Acceptance criteria:

- New-thread analysis can remove a matching published thread.
- SQS reanalysis can remove a matching published thread.
- Stale-run retries use the same behavior without creating duplicate removal
  actions.
- A thread removed during analysis is not removed again.
- A failure to invoke or validate analysis leaves the thread unchanged.
- The successful analysis row is not incorrectly changed to failed because a
  later enforcement or audit operation failed.

## 5. Epic C: Audit event

### ATR-008 - Define `thread.auto_removed` event v1

Priority: P0  
Dependencies: ATR-007  
Target files:

- `backend/src/modules/content-analysis/application/` event port/types
- existing thread event publisher port or a dedicated audit event publisher
- `docs/automatic-thread-removal/EVENT_CONTRACT.md`

Tasks:

- Define event type `thread.auto_removed` and version `1`.
- Use the analysis run ID as the stable event ID/source event ID where the
  event contract allows it.
- Include thread ID, society ID, author ID, analysis run ID, reason code,
  finding metadata, model ID, prompt version, policy version, threshold, and
  timestamp.
- Do not include raw thread body, image bytes, author email, voter identity,
  reporter identity, or an unrestricted model transcript.
- Link the event to the restricted analysis run through its ID.

Acceptance criteria:

- The event is versioned and has a strict schema.
- The payload is sufficient to explain why the thread was automatically hidden
  without copying user content into the integration audit table.
- Duplicate delivery has one durable audit row.

### ATR-009 - Extend the existing SQS audit publisher

Priority: P0  
Dependencies: ATR-008  
Target files:

- `backend/src/modules/discussions/application/thread-events.port.ts`, or a
  new cross-module event port
- `backend/src/modules/discussions/infrastructure/thread-events.sqs.publisher.ts`
- `backend/src/server.ts`
- publisher unit tests

Tasks:

- Add a publisher method for the new event without changing the existing
  `thread.created` contract.
- Set SQS message attributes for event type and version.
- Preserve the current shared `thread-events` queue and DLQ.
- Keep AWS SDK usage in infrastructure code.
- Make event publication idempotent at the consumer using the stable source
  event ID.
- Decide and document whether producer failures are retried with bounded
  backoff or handled by the future transactional outbox.

Acceptance criteria:

- Local development works without AWS through a no-op publisher.
- A configured queue receives valid `thread.auto_removed` messages.
- Existing `thread.created` publishing and audit ingestion remain unchanged.
- Producer logs contain IDs and operational metadata, not user content.

### ATR-010 - Extend audit consumer validation and persistence

Priority: P0  
Dependencies: ATR-008  
Target files:

- `backend/src/modules/audit/application/audit-events.consumer.ts`
- audit consumer tests
- audit event repository integration tests if required

Tasks:

- Convert the current single-event validation into a strict union or equivalent
  dispatcher for `thread.created` and `thread.auto_removed`.
- Map the new event into `RecordAuditEventInput`.
- Preserve ack-after-persist behavior.
- Treat duplicate source IDs as successfully processed.
- Leave malformed messages and persistence failures unacknowledged for retry
  and DLQ handling.

Acceptance criteria:

- Valid `thread.auto_removed` messages create audit rows.
- Invalid versions, missing IDs, invalid confidence, and unknown reason codes
  are rejected.
- Duplicate messages do not create duplicate rows.
- Existing thread-created consumer tests continue to pass.

### ATR-011 - Decide audit delivery durability before release

Priority: P1  
Dependencies: ATR-009, ATR-010  
Target files:

- `docs/SQS_THREAD_AUDIT_GUIDE.md`
- `docs/automatic-thread-removal/EVENT_CONTRACT.md`
- potentially a future outbox module/migration

Tasks:

- Record the delivery guarantee for the first release.
- If direct SQS publishing remains, document that a producer outage can lose an
  event before it reaches SQS.
- If audit completeness is required for the final submission, add a
  transactional outbox so the status change and event intent commit together.
- Do not claim guaranteed audit delivery without an outbox or equivalent
  durable handoff.

Acceptance criteria:

- The runbook clearly states what operators can expect during SQS outages.
- The feature is not described as compliance-grade audit logging unless the
  outbox hardening is implemented.

## 6. Epic D: Restore and moderation UX

### ATR-012 - Verify existing Accept restoration

Priority: P0  
Dependencies: ATR-007  
Target files:

- `backend/src/modules/discussions/application/thread.service.ts`
- `backend/src/modules/discussions/application/discussion.service.test.ts`
- `web/src/features/analysis/analysis-actions.tsx`
- existing analysis API/UI tests

Tasks:

- Confirm an automatically removed thread retains a latest `review` result.
- Confirm the existing Accept endpoint changes `removed -> published`.
- Confirm the human override is stored with the actor ID and optional reason.
- Confirm society moderators can restore only within their society and system
  admins retain global authority.
- Confirm the action is visible for retained privileged readers.

Acceptance criteria:

- No new restore route is introduced.
- A moderator can restore a matching auto-removed thread through the existing
  analysis UI.
- A plain member cannot restore it.
- The restore path does not delete or rewrite the automatic audit event.

### ATR-013 - Add optional automatic-removal presentation

Priority: P2  
Dependencies: ATR-012  
Target files:

- `web/src/features/analysis/`
- `web/src/features/discussions/analysis-badge.tsx`
- relevant page/component tests

Tasks:

- Consider displaying an `Automatically hidden` indicator when a retained
  thread has a matching analysis result and status `removed`.
- Keep ordinary `review` and manually removed states distinguishable only if
  the API provides authoritative data.
- Do not expose sensitive audit rationale or raw model content to students.

Acceptance criteria:

- This task is optional and does not block backend release.

## 7. Epic E: Infrastructure and documentation

### ATR-014 - Wire configuration through ECS/OpenTofu

Priority: P1  
Dependencies: ATR-002  
Target files:

- `infras/variables.tf`
- `infras/compute.tf`
- `infras/terraform.tfvars.example`
- `infras/README.md`

Tasks:

- Add the threshold variable with a safe default.
- Keep `content_analysis_mode` configurable and default rollout examples to
  `shadow` until validation is complete.
- Do not add Lambda, Fargate, NAT Gateway, load balancer, IAM user, or custom
  role resources for this feature.
- Preserve `us-east-1`, the shared `LabRole`, and the existing ECS task.

Acceptance criteria:

- `tofu validate` passes.
- A plan shows only the intended environment variable/resource changes.
- The deployment can be rolled back to `shadow` or `off` without a migration.

### ATR-015 - Add operations and demo evidence

Priority: P1  
Dependencies: ATR-007, ATR-010, ATR-014  
Target files:

- `docs/automatic-thread-removal/ROLLOUT_RUNBOOK.md`
- `docs/automatic-thread-removal/TEST_PLAN.md`
- existing analysis/audit guides where cross-links are appropriate

Tasks:

- Document rollout gates, logs, queue checks, audit-row verification, restore
  verification, and rollback.
- Define the exact identifiers needed for evidence: thread ID, run ID, event
  ID, SQS message ID, and audit row.
- Document teardown for AWS Learner Lab resources after the demo.

Acceptance criteria:

- Another team member can execute the demo without reading source code.
- The evidence demonstrates both automatic hiding and moderator restoration.

## 8. Definition of done

The feature is complete only when all of the following are true:

- ATR-001 through ATR-012 are complete.
- All P0 and P1 tests pass.
- `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm build` pass from
  `backend/`.
- Frontend typecheck/lint/build pass if frontend files changed.
- PostgreSQL integration coverage proves the conditional status transition.
- Audit consumer tests prove validation, persistence-before-ack, and
  idempotency.
- A shadow-mode evaluation records false-positive observations before enforce
  mode is enabled.
- The live demo proves: matching analysis, `removed` status, audit row, queue
  processing, and Accept-based restoration.
- The runbook documents how to disable the feature with `off` or `shadow`.

## 9. Deferred follow-up

- Author email notification.
- Author appeal workflow.
- Dedicated restore endpoint for report-only removals.
- Society-level thresholds and policy controls.
- A separate automated moderation action table with a machine actor.
- Transactional outbox if not delivered in ATR-011.
