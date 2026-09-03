import { request } from "../../lib/http";

export interface UserGrowthData {
  registrations: number;
  activeUsers: number;
  totalUsers: number;
  suspensions: number;
}

export interface ContentVolumeData {
  threads: number;
  comments: number;
  votes: number;
  reports: number;
}

export interface TopSocietyEntry {
  societyId: string;
  name: string;
  memberCount: number;
  threadCount: number;
}

export interface TopSocietiesData {
  topByMembers: TopSocietyEntry[];
  topByThreads: TopSocietyEntry[];
}

export interface ModerationData {
  pendingReports: number;
  resolvedToday: number;
  avgResolutionHours: number;
  totalReports: number;
}

export type MetricPayload = UserGrowthData | ContentVolumeData | TopSocietiesData | ModerationData;
export type MetricType = "user_growth" | "content_volume" | "top_societies" | "moderation";

export interface AnalyticsMetric {
  id: string;
  metricType: MetricType;
  societyId: string | null;
  periodStart: string;
  periodEnd: string;
  data: MetricPayload;
}

export interface AnalyticsPage {
  metrics: AnalyticsMetric[];
  page: {
    cursor: string | null;
    hasMore: boolean;
  };
}

export type RefreshStatus = "requested" | "exporting" | "querying" | "completed" | "failed";

export interface RefreshRun {
  runId: string;
  trigger: "admin" | "nightly";
  status: RefreshStatus;
  attempts: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RefreshResponse {
  accepted: boolean;
  message: string;
  runId?: string;
  status?: RefreshStatus;
}

export interface QueryParams {
  metricType?: MetricType;
  societyId?: string;
  periodStart?: string;
  periodEnd?: string;
  limit?: number;
}

export function queryMetrics(params: QueryParams = {}): Promise<AnalyticsPage> {
  const searchParams = new URLSearchParams();
  if (params.metricType) searchParams.set("metric_type", params.metricType);
  if (params.societyId) searchParams.set("society_id", params.societyId);
  if (params.periodStart) searchParams.set("period_start", params.periodStart);
  if (params.periodEnd) searchParams.set("period_end", params.periodEnd);
  if (params.limit) searchParams.set("limit", String(params.limit));

  const query = searchParams.toString();
  return request<AnalyticsPage>(`/api/v1/admin/analytics${query ? `?${query}` : ""}`);
}

export function refreshAnalytics(): Promise<RefreshResponse> {
  return request<RefreshResponse>("/api/v1/admin/analytics/refresh", { method: "POST" });
}
export function getAnalyticsRefreshStatus(): Promise<RefreshRun | null> {
  return request<RefreshRun | null>("/api/v1/admin/analytics/refresh/status");
}