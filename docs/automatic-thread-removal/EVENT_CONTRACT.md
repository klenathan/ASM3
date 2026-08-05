# Automatic Thread Removal Event Contract

## 1. Event summary

Event type: `thread.auto_removed`  
Version: `1`  
Transport: existing `thread-events` Amazon SQS standard queue  
Consumer: `AuditEventConsumer`  
Storage: `integration_audit_events`

The event is emitted only after a conditional `published -> removed` transition
actually succeeds. A matching analysis result that finds the thread already
inactive does not emit a new event.

## 2. Message body

Proposed version-one body:

```json
{
  "eventId": "<analysis-run-uuid>",
  "eventType": "thread.auto_removed",
  "version": 1,
  "threadId": "<thread-uuid>",
  "societyId": "<society-uuid>",
  "authorId": "<author-uuid>",
  "analysisRunId": "<analysis-run-uuid>",
  "reasonCode": "high_severity_high_confidence",
  "threshold": 0.9,
  "finding": {
    "category": "<model-category>",
    "severity": "high",
    "confidence": 0.97,
    "source": "body",
    "sourceId": null
  },
  "modelId": "<model-id>",
  "promptVersion": "<prompt-version>",
  "policyVersion": "<policy-version>",
  "occurredAt": "<ISO-8601-UTC>"
}
```

`sourceId` is optional and may identify an image/comment source without
including the underlying content. If the result contains multiple qualifying
findings, the implementation may record all matched metadata or select one
deterministically. The selection rule must be documented and tested.

## 3. Validation rules

The audit consumer must reject messages that do not satisfy all of the
following:

- `eventId`, `threadId`, `societyId`, `authorId`, and `analysisRunId` are UUIDs;
- `eventType` is exactly `thread.auto_removed`;
- `version` is exactly `1`;
- `reasonCode` is a known value;
- `threshold` is within `[0, 1]`;
- finding severity is `high`;
- finding confidence is within `[0, 1]` and is greater than or equal to the
  threshold;
- finding source is one of the supported analysis sources;
- model, prompt, and policy metadata are bounded strings;
- `occurredAt` is a valid timestamp.

The consumer must use strict object validation so unexpected fields do not
silently change the contract. If the implementation uses a discriminated
union, preserve the current `thread.created` schema unchanged.

## 4. Idempotency

Use `analysisRunId` as the stable `eventId` and `sourceEventId` for the first
version. The same analysis run can therefore be retried without creating
multiple audit rows.

The audit repository already treats duplicate `source_event_id` values as a
successful processed message. The consumer must acknowledge both `created` and
`duplicate` outcomes.

## 5. SQS attributes

The publisher must set:

```text
eventType = thread.auto_removed
eventVersion = 1
```

The body remains the authoritative contract. The attributes are routing and
operational metadata only.

## 6. Delivery behavior

The existing queue and DLQ should be reused for the coursework MVP. No new SQS
queue or ECS task is required.

Document the selected producer behavior:

1. Preferred: bounded producer retry before logging a failure.
2. Strong guarantee: transactional outbox records the event intent with the
   status transition and relays it to SQS.
3. Minimum acceptable behavior: direct send with an explicit known-loss risk
   during a producer outage.

The feature must not claim guaranteed audit completeness under option 3.

### Selected producer behavior (ATR-008/ATR-009)

The first version implements **option 3 (minimum acceptable behavior)**:

- The `thread.auto_removed` event is sent directly to the shared `thread-events`
  SQS queue via `SendMessageCommand` from
  `backend/src/modules/discussions/infrastructure/thread-events.sqs.publisher.ts`
  (`SqsThreadEventPublisher.publishAutoRemoved`).
- **No retry** is performed by the producer. A failed send is logged (with
  event ID, thread ID, and queue URL, never user content) and swallowed, so a
  failed send never fails or rolls back an already-committed automatic removal.
- **Known-loss risk:** because there is no outbox, a producer outage between the
  committed `published -> removed` transition and the SQS send can lose the
  event before it reaches the queue. Under this option we do **not** claim
  guaranteed audit completeness.
- A **transactional outbox** that records the event intent atomically with the
  status transition and relays it to SQS is deferred to future work (a
  potential outbox module/migration). Until then the known-loss window above is
  accepted and documented.


## 7. Audit row mapping

Map the event to the existing audit repository as follows:

| Audit field | Event field |
| --- | --- |
| `sourceEventId` | `eventId` |
| `eventType` | `eventType` |
| `version` | `version` |
| `threadId` | `threadId` |
| `societyId` | `societyId` |
| `authorId` | `authorId` |
| `title` | `null` unless rehydrated safely |
| `payload` | complete validated event |
| `receivedAt` | consumer receipt time |

Do not add a synthetic human actor. Automated actions have no human actor and
belong in the platform audit event stream, not the actor-required
`moderation_actions` table.

## 8. Compatibility

- Existing `thread.created` consumers and audit rows must remain compatible.
- Unknown future event versions should remain unacknowledged or be routed to
  the existing DLQ according to the current consumer policy.
- A version bump is required for incompatible field or semantic changes.
