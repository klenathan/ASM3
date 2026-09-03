import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { migrateWithLock } from "../../../../test/database";
import { DrizzleAuditEventRepository } from "./drizzle-audit-events.repository";

// PostgreSQL integration coverage for the audit table's unique event-ID
// constraint. These run only when DATABASE_URL is provided (set DATABASE_URL
// and give the role permission to run migrations and write the table).
const connectionString = process.env.DATABASE_URL;
const describeWithDb = connectionString === undefined ? describe.skip : describe;

function input(sourceEventId: string) {
  return {
    id: randomUUID(),
    sourceEventId,
    eventType: "thread.created",
    version: 1,
    threadId: randomUUID(),
    societyId: randomUUID(),
    authorId: randomUUID(),
    title: "Integration thread",
    payload: { sourceEventId },
    receivedAt: new Date(),
  };
}

describeWithDb("integration_audit_events unique constraint", () => {
  let pool: Pool;
  let repository: DrizzleAuditEventRepository;

  beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const db = drizzle({ client: pool });
    await migrateWithLock(pool);
    repository = new DrizzleAuditEventRepository(db);
  });

  afterAll(async () => {
    if (pool !== undefined) await pool.end();
  });

  it("records an event once and reports a duplicate for the same source_event_id", async () => {
    const sourceEventId = randomUUID();
    const first = await repository.record(input(sourceEventId));
    expect(first).not.toBe("duplicate");

    const second = await repository.record(input(sourceEventId));
    expect(second).toBe("duplicate");

    await pool.query(
      "delete from integration_audit_events where source_event_id = $1",
      [sourceEventId],
    );
  });
});
