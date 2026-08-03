import { request } from "../../lib/http";

export type ReportStatus = "pending" | "in_review" | "resolved" | "dismissed";
export type ReportTargetType = "thread" | "comment";
export type ResolveAction = "remove_content" | "ban_member" | "suspend_user";

export interface Report {
  readonly id: string;
  readonly societyId: string;
  readonly reporterId: string;
  readonly threadId: string | null;
  readonly commentId: string | null;
  readonly targetType: ReportTargetType;
  readonly targetId: string;
  readonly reason: string;
  readonly details: string | null;
  readonly status: ReportStatus;
  readonly assignedTo: string | null;
  readonly resolution: string | null;
  readonly resolutionNote: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly resolvedAt: string | null;
  readonly resolvedBy: string | null;
}

export interface ReportPage {
  readonly items: Report[];
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
}

export interface ListReportsParams {
  readonly status?: ReportStatus;
  readonly cursor?: string;
  readonly limit?: number;
}

export function fetchReports(params: ListReportsParams = {}): Promise<ReportPage> {
  const search = new URLSearchParams();
  if (params.status !== undefined) search.set("status", params.status);
  if (params.cursor !== undefined) search.set("cursor", params.cursor);
  if (params.limit !== undefined) search.set("limit", String(params.limit));
  const query = search.toString();
  return request<ReportPage>(`/api/v1/admin/reports${query === "" ? "" : `?${query}`}`);
}

export function claimReport(reportId: string): Promise<Report> {
  return request<Report>(`/api/v1/mod/reports/${encodeURIComponent(reportId)}/claim`, {
    method: "POST",
  });
}

export interface ResolveReportInput {
  readonly action: ResolveAction;
  readonly resolutionNote?: string;
  readonly suspendedUntil?: string | null;
}

export function resolveReport(
  reportId: string,
  input: ResolveReportInput,
): Promise<Report> {
  return request<Report>(`/api/v1/mod/reports/${encodeURIComponent(reportId)}/resolve`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export interface DismissReportInput {
  readonly resolutionNote?: string;
}

export function dismissReport(
  reportId: string,
  input: DismissReportInput,
): Promise<Report> {
  return request<Report>(`/api/v1/mod/reports/${encodeURIComponent(reportId)}/dismiss`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}
