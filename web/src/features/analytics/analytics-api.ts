import { request } from "../../lib/http";

export type RefreshStatus = "requested" | "exporting" | "querying" | "completed" | "failed" | "cancelled";

export interface RefreshRun {
  runId: string;
  trigger: "admin" | "nightly";
  status: RefreshStatus;
  attempts: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  periodStart?: string;
  periodEnd?: string;
}

export interface RefreshResponse {
  accepted: boolean;
  message: string;
  runId?: string;
  status?: RefreshStatus;
  coalesced?: boolean;
  periodStart?: string;
  periodEnd?: string;
  warnings?: string[];
}
export interface RefreshCancellationResponse {
  cancelled: boolean;
  message: string;
  runId?: string;
  status?: RefreshStatus;
}

export type ActionMetricKind = "activity" | "current_state" | "reconciliation";
export type ActionMetricGrain = "platform" | "society" | "content";
export interface ActionMetric {
  id: string;
  source: "action_events";
  metricKind: ActionMetricKind;
  grain: ActionMetricGrain;
  societyId: string | null;
  targetType: "thread" | "comment" | null;
  targetId: string | null;
  threadId: string | null;
  periodStart: string;
  periodEnd: string;
  snapshotAt: string | null;
  data: Record<string, unknown>;
}
export interface ActionAnalyticsPage {
  contractVersion: 2;
  recordingStartedAt: string;
  metrics: ActionMetric[];
  page: { cursor: string | null; hasMore: boolean };
}
export interface ActionQueryParams {
  grain?: ActionMetricGrain;
  societyId?: string;
  targetType?: "thread" | "comment";
  targetId?: string;
  periodStart?: string;
  periodEnd?: string;
  cursor?: string;
  limit?: number;
}

export function queryActionMetrics(params: ActionQueryParams = {}): Promise<ActionAnalyticsPage> {
  const searchParams = new URLSearchParams();
  if (params.grain) searchParams.set("grain", params.grain);
  if (params.societyId) searchParams.set("society_id", params.societyId);
  if (params.targetType) searchParams.set("target_type", params.targetType);
  if (params.targetId) searchParams.set("target_id", params.targetId);
  if (params.periodStart) searchParams.set("period_start", params.periodStart);
  if (params.periodEnd) searchParams.set("period_end", params.periodEnd);
  if (params.cursor) searchParams.set("cursor", params.cursor);
  if (params.limit) searchParams.set("limit", String(params.limit));
  const query = searchParams.toString();
  return request<ActionAnalyticsPage>(`/api/v2/admin/analytics${query ? `?${query}` : ""}`);
}

export function refreshActionAnalytics(periodStart: string, periodEnd: string): Promise<RefreshResponse> {
  return request<RefreshResponse>("/api/v2/admin/analytics/refresh", {
    method: "POST",
    body: JSON.stringify({ periodStart, periodEnd }),
    headers: { "Content-Type": "application/json" },
  });
}
export function cancelLatestActionAnalyticsRefresh(): Promise<RefreshCancellationResponse> {
  return request<RefreshCancellationResponse>("/api/v2/admin/analytics/refresh/cancel", {
    method: "POST",
  });
}

export function getActionAnalyticsRefreshStatus(runId: string): Promise<RefreshRun | null> {
  return request<RefreshRun | null>(`/api/v2/admin/analytics/refresh/${runId}`);
}
export function getLatestActionAnalyticsRefreshStatus(): Promise<RefreshRun | null> {
  return request<RefreshRun | null>("/api/v2/admin/analytics/refresh/status");
}
