import { request } from "../../lib/http";

export interface AuditEvent {
  readonly id: string;
  readonly sourceEventId: string;
  readonly eventType: string;
  readonly version: number;
  readonly threadId: string | null;
  readonly societyId: string | null;
  readonly authorId: string | null;
  readonly title: string | null;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly receivedAt: string;
  readonly processingStatus: string;
}

export interface AuditPage {
  readonly items: AuditEvent[];
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
}

export interface ListAuditParams {
  readonly cursor?: string;
  readonly limit?: number;
}

export function fetchAuditEvents(params: ListAuditParams = {}): Promise<AuditPage> {
  const search = new URLSearchParams();
  if (params.cursor !== undefined) search.set("cursor", params.cursor);
  if (params.limit !== undefined) search.set("limit", String(params.limit));
  const query = search.toString();
  return request<AuditPage>(`/api/v1/admin/audit${query === "" ? "" : `?${query}`}`);
}
