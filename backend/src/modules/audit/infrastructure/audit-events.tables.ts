import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

export const integrationAuditEvents = pgTable(
  "integration_audit_events",
  {
    id: uuid("id").primaryKey(),
    sourceEventId: uuid("source_event_id").notNull(),
    eventType: text("event_type").notNull(),
    version: integer("version").notNull(),
    threadId: uuid("thread_id"),
    societyId: uuid("society_id"),
    authorId: uuid("author_id"),
    title: varchar("title", { length: 300 }),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    receivedAt: timestamp("received_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    processingStatus: text("processing_status").notNull().default("processed"),
  },
  (table) => [
    uniqueIndex("integration_audit_events_source_event_id_uidx")
      .on(table.sourceEventId),
    index("integration_audit_events_thread_idx").on(table.threadId),
    index("integration_audit_events_received_idx").on(table.receivedAt),
  ],
);
