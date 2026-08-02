import { desc, sql } from "drizzle-orm";
import {
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { authUsers } from "../../identity/infrastructure/auth.tables.js";
import { comments, threads } from "../../discussions/infrastructure/discussion.tables.js";
import { societies } from "../../societies/infrastructure/society.tables.js";

export const reports = pgTable(
  "reports",
  {
    id: uuid("id").primaryKey(),
    societyId: uuid("society_id")
      .notNull()
      .references(() => societies.id, { onDelete: "restrict" }),
    reporterId: uuid("reporter_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "restrict" }),
    threadId: uuid("thread_id").references(() => threads.id, { onDelete: "restrict" }),
    commentId: uuid("comment_id").references(() => comments.id, { onDelete: "restrict" }),
    reason: text("reason").notNull(),
    details: varchar("details", { length: 1000 }),
    status: text("status").notNull().default("pending"),
    assignedTo: uuid("assigned_to").references(() => authUsers.id, {
      onDelete: "set null",
    }),
    resolution: text("resolution"),
    resolutionNote: varchar("resolution_note", { length: 1000 }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true, mode: "date" }),
    resolvedBy: uuid("resolved_by").references(() => authUsers.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    check(
      "reports_exactly_one_target_check",
      sql`(${table.threadId} is not null) <> (${table.commentId} is not null)`,
    ),
    check(
      "reports_status_check",
      sql`${table.status} in ('pending', 'in_review', 'resolved', 'dismissed')`,
    ),
    uniqueIndex("reports_active_thread_reporter_target_uidx")
      .on(table.reporterId, table.threadId)
      .where(
        sql`${table.status} in ('pending', 'in_review') and ${table.threadId} is not null`,
      ),
    uniqueIndex("reports_active_comment_reporter_target_uidx")
      .on(table.reporterId, table.commentId)
      .where(
        sql`${table.status} in ('pending', 'in_review') and ${table.commentId} is not null`,
      ),
    index("reports_society_status_created_id_idx").on(
      table.societyId,
      table.status,
      table.createdAt,
      table.id,
    ),
    index("reports_reporter_created_idx").on(table.reporterId, desc(table.createdAt)),
  ],
);

export const moderationActions = pgTable(
  "moderation_actions",
  {
    id: uuid("id").primaryKey(),
    societyId: uuid("society_id").references(() => societies.id, { onDelete: "restrict" }),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "restrict" }),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    reason: varchar("reason", { length: 1000 }).notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "moderation_actions_target_type_check",
      sql`${table.targetType} in ('user', 'membership', 'thread', 'comment', 'report')`,
    ),
    index("moderation_actions_society_created_idx").on(
      table.societyId,
      desc(table.createdAt),
    ),
    index("moderation_actions_target_created_idx").on(
      table.targetType,
      table.targetId,
      desc(table.createdAt),
    ),
  ],
);
