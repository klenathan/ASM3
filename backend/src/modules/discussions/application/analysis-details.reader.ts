import type { ThreadAnalysisDetails } from "../../content-analysis";

/**
 * Read-only port for surfacing the full, persisted automated content-analysis
 * outcome for a single thread to a privileged reviewer (system admin or the
 * thread's society moderator). Implemented by the content-analysis module.
 */
export interface ThreadAnalysisDetailsReader {
  findLatestSucceededAnalysis(
    threadId: string,
  ): Promise<ThreadAnalysisDetails | null>;
}
