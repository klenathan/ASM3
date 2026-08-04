import { useQuery } from "@tanstack/react-query";

import { fetchThreadAnalysis } from "./analysis-api";
import type { ThreadAnalysis } from "./types";

/**
 * Full automated content-analysis details for a thread.
 * Only enabled for privileged viewers (system admin / society moderator).
 */
export function useThreadAnalysis(
  threadId: string,
  enabled = true,
) {
  return useQuery<ThreadAnalysis | null>({
    queryKey: ["threads", threadId, "analysis"],
    queryFn: () => fetchThreadAnalysis(threadId),
    enabled: enabled && threadId.length > 0,
    retry: false,
  });
}
