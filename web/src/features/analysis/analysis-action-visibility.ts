/** Keep this aligned with the backend stale pending-run threshold. */
export const ANALYSIS_STALE_AFTER_MS = 15 * 60 * 1000;

export type AnalysisActionDecision = "allow" | "review" | null | undefined;

export function shouldShowAnalysisActions(
  decision: AnalysisActionDecision,
  threadUpdatedAt: string,
  now = Date.now(),
): boolean {
  if (decision === "allow" || decision === "review") return true;

  const updatedAt = Date.parse(threadUpdatedAt);
  return Number.isFinite(updatedAt) && now - updatedAt >= ANALYSIS_STALE_AFTER_MS;
}
