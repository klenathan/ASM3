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
  /**
   * Return the latest settled run status per thread (succeeded or failed),
   * omitting threads whose latest run is still pending/queued/running or that
   * have no run. Lets the review queue surface failed analysis distinctly from
   * threads still awaiting a decision.
   */
  findLatestStatusByThreads(
    threadIds: readonly string[],
  ): Promise<ReadonlyMap<string, "succeeded" | "failed">>;
  /**
   * Return the set of thread IDs that have a recorded human override, so the
   * review queue can drop already-resolved threads.
   */
  findOverriddenThreadIds(threadIds: readonly string[]): Promise<Set<string>>;
}
