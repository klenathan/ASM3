import type { Database } from "../../../db/client";
import {
  cursorFor,
  decodeCursor,
  encodeCursor,
  type PageRequest,
  type PageResult,
} from "../../../shared/application/pagination";
import { ApplicationError } from "../../../shared/domain/errors";
import { and, desc, eq, lt, or } from "drizzle-orm";
import type { AuditEventRecord } from "../domain/audit.event";
import type {
  AuditEventRepository,
  RecordAuditEventInput,
} from "../application/audit-events.repository";
import { integrationAuditEvents } from "./audit-events.tables";

type AuditExecutor = Pick<Database, "select" | "insert">;

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

  async list(page: PageRequest): Promise<PageResult<AuditEventRecord>> {
    const after = page.cursor === undefined ? undefined : auditEventAfter(page.cursor);
    const where = after === undefined ? undefined : after;
    const rows = await this.executor
      .select()
      .from(integrationAuditEvents)
      .where(where)
      .orderBy(desc(integrationAuditEvents.receivedAt), desc(integrationAuditEvents.id))
      .limit(page.limit + 1);
    return pageResult(rows, page.limit);
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

function pageResult(
  rows: readonly (typeof integrationAuditEvents.$inferSelect)[],
  limit: number,
): PageResult<AuditEventRecord> {
  const items = rows.slice(0, limit).map(toAuditEvent);
  const last = items.at(-1);
  const hasMore = rows.length > limit;
  return {
    items,
    hasMore,
    nextCursor: hasMore && last !== undefined
      ? encodeCursor(cursorFor(last.receivedAt, last.id))
      : null,
  };
}

function auditEventAfter(encoded: string) {
  const cursor = decodeCursor(encoded);
  if (typeof cursor.value !== "string" || !isUuid(cursor.id)) {
    throw new ApplicationError("INVALID_CURSOR", "The supplied cursor is invalid");
  }
  const date = new Date(cursor.value);
  if (Number.isNaN(date.getTime())) {
    throw new ApplicationError("INVALID_CURSOR", "The supplied cursor is invalid");
  }
  return or(
    lt(integrationAuditEvents.receivedAt, date),
    and(eq(integrationAuditEvents.receivedAt, date), lt(integrationAuditEvents.id, cursor.id)),
  );
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
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
