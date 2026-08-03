import type { PageResult } from "../../../shared/application/pagination";
import type { AuditEventRecord } from "../domain/audit.event";

export interface AuditEventDto {
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

export type AuditEventPageDto = PageResult<AuditEventDto>;

export function toAuditEventDto(record: AuditEventRecord): AuditEventDto {
  return {
    id: record.id,
    sourceEventId: record.sourceEventId,
    eventType: record.eventType,
    version: record.version,
    threadId: record.threadId,
    societyId: record.societyId,
    authorId: record.authorId,
    title: record.title,
    payload: record.payload,
    receivedAt: record.receivedAt.toISOString(),
    processingStatus: record.processingStatus,
  };
}

export function toAuditEventPageDto(page: PageResult<AuditEventRecord>): AuditEventPageDto {
  return {
    items: page.items.map(toAuditEventDto),
    nextCursor: page.nextCursor,
    hasMore: page.hasMore,
  };
}
