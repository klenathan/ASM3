# Automatic Thread Removal

This folder contains the implementation backlog and delivery documentation for
automatically hiding threads that content analysis identifies as an obvious,
high-confidence violation.

## Feature decision

When an analysis run succeeds in `enforce` mode, the backend automatically
changes a thread from `published` to `removed` when all of the following are
true:

- the analysis decision is `review`;
- at least one finding has `severity: "high"`;
- that finding has `confidence >= 0.90`;
- the thread is still `published` at the point of enforcement.

The rule applies globally to all societies. There is no society-level opt-in in
the first release.

Threads that do not match the rule keep the current behavior. In particular,
an ordinary `review` result remains available to moderators through the review
queue and is not automatically removed.

## User and moderator behavior

- Students see the same unavailable-thread behavior used for other removed
  threads.
- Moderators and system admins can inspect the retained thread and its analysis
  result.
- The existing analysis **Accept** action restores an automatically removed
  thread by changing it back to `published` and recording a human override.
- No email notification or appeal workflow is included in this release.

## Delivery order

1. Complete the domain predicate and configuration contract.
2. Add the active-thread enforcement port and atomic status transition.
3. Add the versioned audit event and consumer support.
4. Wire enforcement into the common analysis-success path.
5. Add backend, integration, frontend regression, and operational tests.
6. Roll out in shadow mode for measurement, then enable `enforce` deliberately.

## Documents

- `BACKLOG.md` - actionable epics, tasks, dependencies, and definition of done.
- `ARCHITECTURE.md` - service flow, module boundaries, status transition, and
  failure handling.
- `EVENT_CONTRACT.md` - `thread.auto_removed` event contract and audit delivery.
- `TEST_PLAN.md` - test matrix and required verification evidence.
- `ROLLOUT_RUNBOOK.md` - configuration, deployment, monitoring, rollback, and
  live-demo procedure.

## Out of scope

- Email notification to the thread author.
- Author appeals.
- New moderation roles or society-specific policy controls.
- New thread statuses such as `pending_review`.
- Automatic removal of comments or reports.
- Automatic deletion. Automatic enforcement only uses the existing reversible
  `removed` status.
