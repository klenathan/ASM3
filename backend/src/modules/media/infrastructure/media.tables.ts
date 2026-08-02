import { sql } from "drizzle-orm";
import { check, pgTable, bigint, text, timestamp, uuid, varchar, uniqueIndex } from "drizzle-orm/pg-core";

import { authUsers } from "../../identity/infrastructure/auth.tables";

export const mediaAssets = pgTable(
  "media_assets",
  {
    id: uuid("id").primaryKey(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "restrict" }),
    objectKey: varchar("object_key", { length: 512 }).notNull(),
    purpose: text("purpose").notNull(),
    contentType: varchar("content_type", { length: 100 }).notNull(),
    byteSize: bigint("byte_size", { mode: "number" }).notNull(),
    checksum: varchar("checksum", { length: 128 }),
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
    deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    uniqueIndex("media_assets_object_key_uidx").on(table.objectKey),
    check(
      "media_assets_purpose_check",
      sql`${table.purpose} in ('thread_attachment', 'avatar')`,
    ),
    check("media_assets_byte_size_positive_check", sql`${table.byteSize} > 0`),
    check(
      "media_assets_status_check",
      sql`${table.status} in ('pending', 'ready', 'quarantined', 'deleted')`,
    ),
  ],
);
