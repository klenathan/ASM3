import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { ACTION_EVENT_TYPES } from "../domain/action-event";

export const actionEvents = pgTable(
  "action_events",
  {
    eventId: uuid("event_id").primaryKey(),
    eventType: text("event_type", { enum: ACTION_EVENT_TYPES }).notNull(),
    schemaVersion: smallint("schema_version").notNull().default(1),
    actorUserId: uuid("actor_user_id").notNull(),
    actorPseudonym: text("actor_pseudonym").notNull(),
    pseudonymKeyVersion: text("pseudonym_key_version").notNull(),
    actorPlatformRole: text("actor_platform_role", { enum: ["student", "system_admin"] }).notNull(),
    actorSocietyRole: text("actor_society_role", { enum: ["member", "moderator"] }),
    occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "date" }).notNull(),
    ingestedAt: timestamp("ingested_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    targetType: text("target_type", { enum: ["society", "thread", "comment", "report"] }).notNull(),
    targetId: uuid("target_id").notNull(),
    societyId: uuid("society_id"),
    threadId: uuid("thread_id"),
    commentId: uuid("comment_id"),
    reportId: uuid("report_id"),
    correlationId: text("correlation_id").notNull(),
    fromReaction: integer("from_reaction"),
    toReaction: integer("to_reaction"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull(),
  },
  (table) => [
    index("idx_action_events_occurred_event").on(table.occurredAt, table.eventId),
    index("idx_action_events_type_occurred").on(table.eventType, table.occurredAt),
    index("idx_action_events_society_occurred").on(table.societyId, table.occurredAt),
    index("idx_action_events_target_occurred").on(table.targetType, table.targetId, table.occurredAt),
    check("action_events_schema_version_check", sql`${table.schemaVersion} = 1`),
    check("action_events_pseudonym_check", sql`${table.actorPseudonym} ~ '^[0-9a-f]{64}$'`),
    check("action_events_key_version_check", sql`length(${table.pseudonymKeyVersion}) > 0`),
    check("action_events_correlation_check", sql`length(${table.correlationId}) BETWEEN 1 AND 128`),
    check("action_events_metadata_check", sql`jsonb_typeof(${table.metadata}) = 'object' AND pg_column_size(${table.metadata}) <= 2048`),
    check("action_events_reaction_values_check", sql`(${table.fromReaction} IS NULL OR ${table.fromReaction} IN (-1, 0, 1)) AND (${table.toReaction} IS NULL OR ${table.toReaction} IN (-1, 0, 1)) AND (${table.fromReaction} IS NULL OR ${table.toReaction} IS NULL OR ${table.fromReaction} <> ${table.toReaction})`),
    check("action_events_reaction_pair_check", sql`(${table.eventType} IN ('thread_reaction_changed', 'comment_reaction_changed') AND ${table.fromReaction} IS NOT NULL AND ${table.toReaction} IS NOT NULL) OR (${table.eventType} NOT IN ('thread_reaction_changed', 'comment_reaction_changed') AND ${table.fromReaction} IS NULL AND ${table.toReaction} IS NULL)`),
    check("action_events_dimensions_check", sql`(
      (${table.eventType} IN ('thread_created', 'thread_edited', 'thread_deleted', 'thread_reaction_changed') AND ${table.targetType} = 'thread' AND ${table.societyId} IS NOT NULL AND ${table.threadId} IS NOT NULL)
      OR (${table.eventType} IN ('comment_created', 'comment_edited', 'comment_deleted', 'comment_reaction_changed') AND ${table.targetType} = 'comment' AND ${table.societyId} IS NOT NULL AND ${table.threadId} IS NOT NULL AND ${table.commentId} IS NOT NULL)
      OR (${table.eventType} IN ('society_membership_joined', 'society_membership_left', 'society_membership_activated') AND ${table.targetType} = 'society' AND ${table.societyId} IS NOT NULL)
      OR (${table.eventType} = 'society_membership_banned' AND ${table.targetType} = 'society' AND ${table.societyId} IS NOT NULL AND ${table.reportId} IS NOT NULL)
      OR (${table.eventType} = 'report_created' AND ${table.targetType} = 'report' AND ${table.societyId} IS NOT NULL AND ${table.reportId} IS NOT NULL AND (${table.threadId} IS NOT NULL OR ${table.commentId} IS NOT NULL))
      OR (${table.eventType} = 'moderation_report_decided' AND ${table.targetType} = 'report' AND ${table.societyId} IS NOT NULL AND ${table.reportId} IS NOT NULL AND (${table.threadId} IS NOT NULL OR ${table.commentId} IS NOT NULL))
    )`),
  ],
);

/** Singleton recording-window state for the v2 contract. */
export const analyticsContractState = pgTable(
  "analytics_contract_state",
  {
    contractVersion: smallint("contract_version").primaryKey(),
    recordingStartedAt: timestamp("recording_started_at", { withTimezone: true, mode: "date" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [check("analytics_contract_state_version_check", sql`${table.contractVersion} = 2`)],
);
