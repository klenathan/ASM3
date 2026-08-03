import type { AuditEventRecord } from "../domain/audit.event";

export interface RecordAuditEventInput {
  readonly id: string;
  readonly sourceEventId: string;
  readonly eventType: string;
  readonly version: number;
  readonly threadId: string | null;
  readonly societyId: string | null;
  readonly authorId: string | null;
  readonly title: string | null;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly receivedAt: Date;
}

export interface AuditEventRepository {
  /**
   * Persist an audit event as idempotently as possible. Returns "created" when
   * the row was inserted and "duplicate" when a row with the same
   * source_event_id already exists. Both results mean the message was
   * durably processed and may be acknowledged.
   */
  record(input: RecordAuditEventInput): Promise<AuditEventRecord | "duplicate">;
}
