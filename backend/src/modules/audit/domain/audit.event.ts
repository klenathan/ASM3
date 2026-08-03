export type AuditProcessingStatus = "processed";

export interface AuditEventRecord {
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
  readonly processingStatus: AuditProcessingStatus;
}
