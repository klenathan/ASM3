import { request } from "../../lib/http";
import type { AnalysisQueueFilter, AnalysisQueuePage, ThreadAnalysis } from "./types";

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

/**
 * Full automated content-analysis details for a thread.
 * Privileged only: system admin or the thread's society moderator.
 * Resolves to null when no successful analysis run exists yet.
 */
export function fetchThreadAnalysis(
  threadId: string,
): Promise<ThreadAnalysis | null> {
  return request<ThreadAnalysis | null>(
    `/api/v1/threads/${encodeURIComponent(threadId)}/analysis`,
  );
}

/** Scope describing which review-queue action endpoint to hit. */
export type AnalysisActionScope =
  | { readonly scope: "admin" }
  | { readonly scope: "moderator"; readonly slug: string };

/**
 * Override a thread's automated analysis decision (accept or reject).
 * `accept` publishes the thread; `reject` hides it. 204 on success.
 */
export function setAnalysisDecision(
  params: AnalysisActionScope & {
    readonly threadId: string;
    readonly decision: "accept" | "reject";
    readonly reason?: string;
  },
): Promise<void> {
  const path =
    params.scope === "admin"
      ? `/api/v1/admin/analysis/${encodeURIComponent(params.threadId)}/decision`
      : `/api/v1/mod/societies/${encodeURIComponent(params.slug)}/analysis/${encodeURIComponent(params.threadId)}/decision`;
  return request<void>(path, {
    method: "POST",
    body: JSON.stringify({
      decision: params.decision,
      ...(params.reason === undefined ? {} : { reason: params.reason }),
    }),
  });
}

/** Re-run automated content analysis for a thread. 204 on success. */
export function reanalyzeThread(
  params: AnalysisActionScope & { readonly threadId: string },
): Promise<void> {
  const path =
    params.scope === "admin"
      ? `/api/v1/admin/analysis/${encodeURIComponent(params.threadId)}/reanalyze`
      : `/api/v1/mod/societies/${encodeURIComponent(params.slug)}/analysis/${encodeURIComponent(params.threadId)}/reanalyze`;
  return request<void>(path, { method: "POST" });
}
