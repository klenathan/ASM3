export type AnalysisActionDecision = "allow" | "review" | null | undefined;

/**
 * Override actions are offered only when the thread's analysis outcome is
 * RESOLVED: the latest settled run accepted (`allow`), flagged for review
 * (`review`), or failed (`failed`). Threads still awaiting a decision
 * (queued/running or never analyzed) are not resolved and show no actions.
 */
export function shouldShowAnalysisActions(
  decision: AnalysisActionDecision,
  failed = false,
): boolean {
  return decision === "allow" || decision === "review" || failed === true;
}
