/**
 * Content-analysis domain model. Statuses and decisions are owned here.
 */

import { DomainError } from "../../../shared/domain/errors";

export type AnalysisRunStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed";

/**
 * Allowed run-status transitions.
 *
 *  - queued -> running     (analysis started)
 *  - queued -> failed      (analysis fails before it starts)
 *  - running -> succeeded  (run completed with a valid result)
 *  - running -> failed     (invocation or validation failure)
 *
 * A run may never leave a terminal status (succeeded/failed).
 */
export const ANALYSIS_RUN_STATUS_TRANSITIONS: Readonly<
  Record<AnalysisRunStatus, ReadonlySet<AnalysisRunStatus>>
> = {
  queued: new Set<AnalysisRunStatus>(["running", "failed"]),
  running: new Set<AnalysisRunStatus>(["succeeded", "failed"]),
  succeeded: new Set<AnalysisRunStatus>(),
  failed: new Set<AnalysisRunStatus>(),
};

/** True when a transition from `from` to `to` is permitted. */
export function canTransitRunStatus(
  from: AnalysisRunStatus,
  to: AnalysisRunStatus,
): boolean {
  return ANALYSIS_RUN_STATUS_TRANSITIONS[from].has(to);
}

/** True when the status is terminal (no further transitions allowed). */
export function isTerminalRunStatus(status: AnalysisRunStatus): boolean {
  return status === "succeeded" || status === "failed";
}

/** True when the status is still in flight (not yet settled). */
export function isPendingRunStatus(status: AnalysisRunStatus): boolean {
  return status === "queued" || status === "running";
}

/**
 * Default age after which a pending run is considered stale and eligible for
 * automatic retry by the background scheduler. Picked to be well above the
 * bounded synchronous Lambda invocation timeout, so only genuinely stuck
 * runs (hangs/aborts) are retried, not in-flight ones.
 */
export const DEFAULT_STALE_PENDING_MS = 15 * 60 * 1000;

/** Default cap on stale runs processed by a single scheduler tick. */
export const DEFAULT_STALE_PENDING_LIMIT = 50;

/**
 * Guard that throws unless `from -> to` is a permitted status transition.
 * Callers persist the new status only after this passes.
 */
export function assertRunStatusTransition(
  from: AnalysisRunStatus,
  to: AnalysisRunStatus,
): void {
  if (!canTransitRunStatus(from, to)) {
    throw new DomainError(
      "ANALYSIS_STATUS_TRANSITION_INVALID",
      `Content-analysis run cannot transition from "${from}" to "${to}"`,
      { from, to },
    );
  }
}

/**
 * Guard that rejects calls that would mutate a terminal run. Useful before
 * any destructive or result write to an already-settled run.
 */
export function assertRunStatusMutable(status: AnalysisRunStatus): void {
  if (isTerminalRunStatus(status)) {
    throw new DomainError(
      "ANALYSIS_RUN_FINALIZED",
      `Content-analysis run is already in terminal status "${status}"`,
      { status },
    );
  }
}

export type AnalysisTriggerType =
  | "thread_created"
  | "thread_updated"
  | "report_created"
  | "reanalysis";

/**
 * A human override of the automated content-analysis decision for a thread.
 * `accept` publishes/keeps the thread visible; `reject` hides it (removed).
 */
export type AnalysisOverrideDecision = "accept" | "reject";

/**
 * Persisted human override for a single thread. The latest override takes
 * precedence over any automated decision for moderation/queue purposes.
 */
export interface ContentAnalysisOverride {
  readonly id: string;
  readonly threadId: string;
  readonly decision: AnalysisOverrideDecision;
  readonly actorId: string;
  readonly reason: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ContentAnalysisRun {
  id: string;
  sourceEventId: string;
  runNumber: number;
  triggerType: AnalysisTriggerType;
  threadId: string;
  reportId: string | null;
  status: AnalysisRunStatus;
  decision: "allow" | "review" | null;
  inputHash: string;
  modelId: string | null;
  lambdaFunctionVersion: string | null;
  createdAt: Date;
}
