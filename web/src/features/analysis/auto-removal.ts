import type { ThreadAnalysis } from "./types";

/**
 * Confidence threshold for automatic content-analysis removal.
 * Must stay aligned with the backend default
 * `DEFAULT_AUTO_REMOVE_THRESHOLD` (`backend/src/modules/content-analysis/domain/content-analysis.policy.ts`).
 */
export const AUTO_REMOVE_CONFIDENCE_THRESHOLD = 0.9;

/**
 * Decide whether a persisted analysis outcome explains an "Automatically
 * hidden" thread. Mirrors the backend auto-removal predicate
 * (`shouldAutoRemove`): a `review` decision with at least one `high`-severity
 * finding whose confidence is at or above the threshold.
 *
 * The database stores an automatic removal as a plain `removed` thread status
 * with no per-thread "auto_removed" flag, so the frontend can only present an
 * authoritative "Automatically hidden" state when it holds BOTH the thread
 * status and the full findings (available only to privileged viewers via
 * `fetchThreadAnalysis`). Without findings, the callers must not claim an
 * automatic removal — an ordinary `review` stays "Flagged for review".
 */
export function isAutoRemoved(analysis: ThreadAnalysis | null | undefined): boolean {
  if (analysis == null) return false;
  if (analysis.decision !== "review") return false;
  if (analysis.findings == null) return false;
  return analysis.findings.some(
    (finding) =>
      finding.severity === "high" &&
      finding.confidence >= AUTO_REMOVE_CONFIDENCE_THRESHOLD,
  );
}
