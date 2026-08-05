/**
 * Read-only port for surfacing the latest automated content-analysis decision
 * for threads. Owned here so the discussions read path never depends on the
 * content-analysis module; the wired implementation (content-analysis
 * repository) satisfies this structurally.
 */
export type AnalysisDecision = "allow" | "review";

export interface AnalysisState {
  readonly status: "queued" | "running" | "succeeded" | "failed" | null;
  readonly decision: AnalysisDecision | null;
  readonly override: "accept" | "reject" | null;
}

export interface AnalysisDecisionReader {
  findLatestAnalysisStatesByThreads(
    threadIds: readonly string[],
  ): Promise<ReadonlyMap<string, AnalysisState>>;
}
