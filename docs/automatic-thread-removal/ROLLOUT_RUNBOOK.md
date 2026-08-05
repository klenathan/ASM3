# Automatic Thread Removal Rollout Runbook

## 1. Safety statement

This feature changes user-visible thread visibility. Do not enable global
`enforce` mode until the domain, service, repository, audit, and restore tests
pass and a shadow-mode sample has been reviewed by the team.

Automatic removal is reversible through the existing moderator/system-admin
Accept action. It is not a permanent delete.

## 2. Configuration

Required settings when analysis is enabled:

```text
CONTENT_ANALYSIS_MODE=shadow|enforce
CONTENT_ANALYSIS_AUTO_REMOVE_CONFIDENCE=0.90
CONTENT_ANALYSIS_POLICY_VERSION=<version>
CONTENT_ANALYSIS_PROMPT_VERSION=<version>
```

Use:

- `off` to disable analysis and automatic enforcement;
- `shadow` to persist analysis without changing thread status;
- `enforce` to enable the automatic removal predicate.

The threshold is global. There is no society-level override in this release.

## 3. Pre-release checklist

- Confirm the active AWS Academy Learner Lab provides the already-approved
  services and region.
- Confirm deployment remains in `us-east-1` unless the active lab explicitly
  permits the configured alternative.
- Confirm the existing ECS task, Lambda, SQS thread-events queue, audit
  consumer, reanalysis queue, and DLQs are healthy.
- Confirm no credentials, API keys, database passwords, or `.env` files are in
  the change.
- Run all backend and relevant frontend commands in `TEST_PLAN.md`.
- Run PostgreSQL integration tests against a disposable/test database.
- Review the event payload for privacy before enabling production/demo traffic.
- Confirm moderators know how to use Accept to restore a false positive.

## 4. Shadow-mode evaluation

Deploy with:

```text
CONTENT_ANALYSIS_MODE=shadow
CONTENT_ANALYSIS_AUTO_REMOVE_CONFIDENCE=0.90
```

For a representative sample, record:

- count of successful analyses;
- count of `review` results;
- count of high-severity findings;
- count of findings at or above `0.90` confidence;
- expected automatic-removal count;
- moderator false-positive assessment;
- Lambda latency and timeout rate;
- OpenRouter rate-limit/error behavior;
- SQS queue depth and DLQ count;
- analysis cost for the demo window.

Do not manually change thread status as part of the shadow measurement unless
the normal moderation workflow requires it. Keep the evaluation reproducible.

## 5. Enable enforcement

After shadow review:

1. Deploy the backend and Lambda policy/prompt versions.
2. Apply only the reviewed infrastructure plan.
3. Run migrations if the implementation added schema changes.
4. Set `CONTENT_ANALYSIS_MODE=enforce`.
5. Keep `CONTENT_ANALYSIS_AUTO_REMOVE_CONFIDENCE=0.90`.
6. Restart the ECS task so configuration is loaded.
7. Verify readiness and health endpoints.
8. Process one controlled test thread before live demonstration.

Do not lower the threshold during a live demo to force an outcome. Use a
deterministic fixture or test analyzer for evidence where possible.

## 6. Live verification

For a matching test thread, verify in order:

1. The analysis run is created and reaches `succeeded`.
2. The result is `review` with a high-severity finding at or above `0.90`.
3. The thread changes from `published` to `removed`.
4. The backend logs include thread ID, run ID, enforcement outcome, and event
   ID, but not raw content.
5. The `thread-events` queue receives the version-one event.
6. The audit consumer persists the event in `integration_audit_events`.
7. The audit consumer acknowledges the message.
8. A moderator can read the retained thread and analysis details.
9. Accept changes the thread back to `published` and records the human
   override.
10. The original automatic audit row remains available.

Useful queue inspection:

```bash
aws sqs get-queue-attributes \
  --queue-url <thread-events-queue-url> \
  --attribute-names ApproximateNumberOfMessages ApproximateNumberOfMessagesNotVisible
```

**Evidence identifiers you must be able to collect** (define all five for the demo):

| Identifier | Source |
| ---------- | ------ |
| thread ID | thread being analyzed / removed |
| analysis run ID | the `content_analysis_runs` row for the run (== event ID) |
| event ID | `eventId` on the `thread.auto_removed` message (== analysis run ID) |
| SQS message ID | `MessageId` returned by `SendMessage`; visible in the publisher log line on success |
| audit row ID | the `integration_audit_events` row created by the consumer for that `source_event_id` |

Use the existing audit database/query tooling to locate the row by
`source_event_id` or `thread_id`. Do not copy message bodies containing user
data into tickets or commits.

## 7. Monitoring

Monitor:

- automatic-removal count by time window;
- automatic-removal count by society;
- analysis success/failure count;
- number of `already_inactive` enforcement no-ops;
- moderator Accept restores after automatic removal;
- audit publisher failures;
- audit queue depth and oldest message age;
- audit DLQ depth;
- analysis queue depth and oldest message age;
- Lambda duration, errors, throttles, and invocation cost.

Recommended structured fields:

```text
threadId
analysisRunId
eventId
societyId
policyVersion
promptVersion
threshold
reasonCode
enforcementOutcome
```

Never log thread body, image bytes, author email, reporter identity, or the
complete model response.

## 8. Rollback and disablement

### Immediate disablement

Set:

```text
CONTENT_ANALYSIS_MODE=shadow
```

This stops new automatic removals while preserving analysis persistence. Use
`off` when analysis itself must stop.

Restart the backend task and verify logs show the expected mode.

### False-positive recovery

1. Moderator opens the retained thread.
2. Moderator reviews the analysis finding.
3. Moderator uses Accept with an optional reason.
4. Verify `removed -> published`.
5. Retain the automatic audit event and human override for review.

### Queue failure

- Do not restore threads merely because audit delivery is delayed.
- Inspect the queue and DLQ using the existing SQS audit guide.
- Redrive only after validating the event contract and consumer health.
- Record any missing audit events as an operational incident if direct
  publishing is still used.

### Code rollback

Revert the application deployment to the last reviewed version and set mode to
`shadow` or `off`. Do not drop status or audit tables. Do not delete removed
threads as part of rollback.

## 9. Teardown

After the coursework demonstration:

- disable analysis or destroy the demo stack according to the repository
  teardown instructions;
- drain or inspect test SQS messages and DLQs;
- stop/destroy temporary EC2/RDS/SQS/Lambda resources as appropriate;
- verify no learner-lab resources remain unintentionally active;
- preserve only sanitized evidence and documentation.
