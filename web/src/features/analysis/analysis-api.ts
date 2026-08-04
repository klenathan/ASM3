import { request } from "../../lib/http";
import type { AnalysisQueueFilter, AnalysisQueuePage } from "./types";

export interface FetchAnalysisQueueParams {
  /** Admin lists globally; moderator is scoped to a society slug. */
  readonly scope: "admin" | "moderator";
  /** Society slug required when scope is "moderator". */
  readonly slug?: string;
  readonly status?: AnalysisQueueFilter;
  readonly cursor?: string;
  readonly limit?: number;
}

export function fetchAnalysisQueue(
  params: FetchAnalysisQueueParams,
): Promise<AnalysisQueuePage> {
  const path =
    params.scope === "admin"
      ? "/api/v1/admin/analysis"
      : `/api/v1/mod/societies/${encodeURIComponent(params.slug ?? "")}/analysis`;

  const search = new URLSearchParams();
  if (params.status !== undefined) search.set("status", params.status);
  if (params.cursor !== undefined) search.set("cursor", params.cursor);
  if (params.limit !== undefined) search.set("limit", String(params.limit));
  const query = search.toString();

  return request<AnalysisQueuePage>(`${path}${query === "" ? "" : `?${query}`}`);
}
