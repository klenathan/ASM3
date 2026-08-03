import type { Database } from "../../../db/client";
import type { AuditEventRecord } from "../domain/audit.event";
import type {
  AuditEventRepository,
  RecordAuditEventInput,
} from "../application/audit-events.repository";
import { integrationAuditEvents } from "./audit-events.tables";

type AuditExecutor = Pick<Database, "insert">;

export class DrizzleAuditEventRepository implements AuditEventRepository {
  private readonly executor: AuditExecutor;

  constructor(executor: AuditExecutor) {
    this.executor = executor;
  }

  async record(input: RecordAuditEventInput): Promise<AuditEventRecord | "duplicate"> {
    try {
      const rows = await this.executor
        .insert(integrationAuditEvents)
        .values({
          id: input.id,
          sourceEventId: input.sourceEventId,
          eventType: input.eventType,
          version: input.version,
          threadId: input.threadId,
          societyId: input.societyId,
          authorId: input.authorId,
          title: input.title,
          payload: input.payload,
          receivedAt: input.receivedAt,
        })
        .returning();
      const row = rows[0];
      if (row === undefined) {
        throw new Error("audit event insert returned no row");
      }
      return toAuditEvent(row);
    } catch (error) {
      if (isUniqueViolation(error)) return "duplicate";
      throw error;
    }
  }
}

function toAuditEvent(row: typeof integrationAuditEvents.$inferSelect): AuditEventRecord {
  return {
    id: row.id,
    sourceEventId: row.sourceEventId,
    eventType: row.eventType,
    version: row.version,
    threadId: row.threadId,
    societyId: row.societyId,
    authorId: row.authorId,
    title: row.title,
    payload: row.payload,
    receivedAt: row.receivedAt,
    processingStatus: "processed",
  };
}

function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current !== null && current !== undefined; depth += 1) {
    if (typeof current === "object" && "code" in current && (current as { code?: unknown }).code === "23505") {
      return true;
    }
    current = isObjectWithCause(current) ? current.cause : undefined;
  }
  return false;
}

function isObjectWithCause(value: unknown): value is { readonly cause: unknown } {
  return typeof value === "object" && value !== null && "cause" in value;
}
