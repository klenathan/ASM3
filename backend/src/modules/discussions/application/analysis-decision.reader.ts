/**
 * Read-only port for surfacing the latest automated content-analysis decision
 * for threads. Owned here so the discussions read path never depends on the
 * content-analysis module; the wired implementation (content-analysis
 * repository) satisfies this structurally.
 */
export type AnalysisDecision = "allow" | "review";

export interface AnalysisDecisionReader {
  findLatestDecisionsByThreads(
    threadIds: readonly string[],
  ): Promise<ReadonlyMap<string, AnalysisDecision>>;
}
