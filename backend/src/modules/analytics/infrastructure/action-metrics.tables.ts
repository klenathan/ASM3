import { check, index, jsonb, pgTable, smallint, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const analyticsActionMetrics = pgTable(
  "analytics_action_metrics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contractVersion: smallint("contract_version").notNull().default(2),
    metricKind: text("metric_kind", { enum: ["activity", "current_state", "reconciliation"] }).notNull(),
    grain: text("grain", { enum: ["platform", "society", "content"] }).notNull(),
    societyId: uuid("society_id"),
    targetType: text("target_type", { enum: ["thread", "comment"] }),
    targetId: uuid("target_id"),
    threadId: uuid("thread_id"),
    periodStart: timestamp("period_start", { withTimezone: true, mode: "date" }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true, mode: "date" }).notNull(),
    snapshotAt: timestamp("snapshot_at", { withTimezone: true, mode: "date" }),
    data: jsonb("data").notNull(),
    refreshRunId: uuid("refresh_run_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_action_metrics_platform_unique").on(table.contractVersion, table.metricKind, table.periodStart).where(sql`${table.grain} = 'platform'`),
    uniqueIndex("idx_action_metrics_society_unique").on(table.contractVersion, table.metricKind, table.societyId, table.periodStart).where(sql`${table.grain} = 'society'`),
    uniqueIndex("idx_action_metrics_content_unique").on(table.contractVersion, table.metricKind, table.targetType, table.targetId, table.periodStart).where(sql`${table.grain} = 'content'`),
    index("idx_action_metrics_refresh_run").on(table.refreshRunId),
    check("analytics_action_metrics_contract_check", sql`${table.contractVersion} = 2`),
    check("analytics_action_metrics_dimensions_check", sql`(${table.grain} = 'platform' AND ${table.societyId} IS NULL AND ${table.targetId} IS NULL) OR (${table.grain} = 'society' AND ${table.societyId} IS NOT NULL AND ${table.targetId} IS NULL) OR (${table.grain} = 'content' AND ${table.societyId} IS NOT NULL AND ${table.targetType} IS NOT NULL AND ${table.targetId} IS NOT NULL AND ${table.threadId} IS NOT NULL)`),
    check("analytics_action_metrics_snapshot_check", sql`(${table.metricKind} = 'activity' AND ${table.snapshotAt} IS NULL) OR (${table.metricKind} <> 'activity' AND ${table.snapshotAt} IS NOT NULL)`),
  ],
);
