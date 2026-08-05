# Automatic Thread Removal Architecture

## 1. Design objective

Use the existing content-analysis service and in-process SQS reanalysis worker
to automatically hide only currently published threads with a high-confidence,
high-severity analysis finding. Keep the decision framework-agnostic, preserve
the modular-monolith dependency rules, and reuse the existing reversible thread
status and audit infrastructure.

## 2. Runtime flow

```text
New thread or reanalysis request
        |
        v
ContentAnalysisService
        |
        v
ThreadAnalysisContextPort loads current content and status
        |
        v
LambdaContentAnalyzer returns validated result
        |
        v
ContentAnalysisRepository records succeeded run
        |
        v
Automatic-removal policy predicate
        |
        +-- no match --> leave published and retain normal review workflow
        |
        +-- match --> remove only if status is still published
                             |
                             v
                    thread.auto_removed event
                             |
                             v
                    existing thread-events SQS queue
                             |
                             v
                    AuditEventConsumer
                             |
                             v
                    integration_audit_events
```

The reanalysis path is:

```text
moderator UI -> reanalysis API -> content-analysis queue -> ReanalysisWorker
             -> ContentAnalysisService.reanalyzeThread -> common success path
```

The worker does not contain the policy. This prevents new-thread analysis,
explicit reanalysis, and stale-run retries from behaving differently.

## 3. Module boundaries

### Content analysis

Owns:

- analysis result validation;
- the high-severity/high-confidence predicate;
- threshold configuration passed into the service;
- orchestration after a successful analysis run;
- the explicit port used to request automated removal.

Must not import:

- Hono;
- Drizzle or PostgreSQL types;
- Discussions concrete repositories or tables;
- AWS SDK classes.

### Discussions

Owns:

- thread status values;
- the atomic `published -> removed` persistence operation;
- the existing human Accept/reject behavior;
- society-scoped authorization for human actions.

The automated path is trusted application orchestration and does not use a
student principal. It must still use a named port and a conditional database
update rather than bypassing the discussion domain.

### Audit

Owns:

- audit event validation;
- durable audit event persistence;
- source-event idempotency;
- SQS acknowledgement behavior;
- audit administration queries.

The audit module must not decide whether a thread should be removed. It records
the already-authorized automated action.

## 4. Enforcement port

Use an explicit application port with a shape equivalent to:

```ts
interface AutomatedThreadRemovalPort {
  removePublishedThread(input: {
    threadId: string;
    analysisRunId: string;
    reasonCode: "high_severity_high_confidence";
    occurredAt: Date;
  }): Promise<{
    outcome: "removed" | "already_inactive";
    threadId: string;
    societyId: string;
    authorId: string;
    title: string;
  }>;
}
```

The exact name may follow repository conventions. The important properties are:

- content analysis receives an interface, not a discussion repository;
- the operation is conditional on `status = published`;
- the result tells the caller whether a transition happened;
- the result contains only the metadata needed for the audit event;
- repeated calls are safe.

The composition root may adapt this port to the Discussions public module and
the existing event publisher. Do not add a direct cross-module table query.

## 5. Race and idempotency behavior

The context status is an early guard, not the final authority. Analysis can
take up to the configured Lambda timeout, so the thread can change state after
context loading.

The final transition must be equivalent to:

```sql
UPDATE threads
SET status = 'removed', updated_at = $now
WHERE id = $thread_id
  AND status = 'published';
```

If zero rows are affected, the service must not emit an automatic-removal
event. This handles:

- a moderator removing the thread first;
- a moderator deleting the thread first;
- a duplicate analysis attempt;
- a retry after the original removal already succeeded.

The analysis run remains a valid successful run even when enforcement is a
no-op because the thread was already inactive.

## 6. Failure handling

### Analysis failure

If Lambda invocation, result validation, or analysis persistence fails:

- record the failed analysis run using the existing behavior;
- leave the thread unchanged;
- do not emit an automatic-removal event.

### Status transition failure

An infrastructure/database error after analysis success must not change the
analysis row back to failed. Log the run ID and thread ID, surface an operational
error, and provide a retry path through the existing stale/reanalysis tooling or
an explicit future enforcement retry mechanism.

### Audit publication failure

The thread must remain removed if publishing the audit event fails. Do not
republish the thread or reverse the safety action. The producer must log the
stable run/event ID and the runbook must document the delivery guarantee.

The first implementation may reuse the existing direct SQS publisher, but that
pattern has a known producer-outage gap. A transactional outbox is required
before claiming guaranteed audit delivery for a production-grade safety path.

### Audit consumer failure

The consumer must:

- validate the event before persistence;
- persist before acknowledging;
- acknowledge duplicates as successful;
- leave malformed or persistence-failed messages for retry/DLQ.

## 7. Status and restoration

Do not add `pending_review` for this feature. Existing statuses remain:

```text
published | removed | deleted
```

Automatic enforcement only performs `published -> removed`.

Restoration uses the existing analysis moderation flow:

```text
moderator/system admin -> Accept analysis decision
                         -> save human override
                         -> removed -> published
```

The automatic audit event remains immutable. The subsequent human Accept
action is a separate event/override and must not erase the automatic history.

## 8. Privacy and audit payload

The audit event should explain the action without duplicating user content.
Include:

- identifiers;
- stable reason code;
- matched finding category, severity, confidence, source, and optional source
  ID;
- analysis run ID;
- model, prompt, and policy versions;
- threshold and timestamp.

Do not include:

- thread body;
- image bytes or image URLs;
- author email;
- voter or reporter identity;
- complete model response;
- unbounded evidence excerpts.

Moderators can use the analysis run ID to inspect the restricted analysis result
through existing privileged APIs.
