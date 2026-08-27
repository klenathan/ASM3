import { jsonb, pgTable, text, timestamp, uuid, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { societies } from "../../societies/infrastructure/society.tables";

export const analyticsMetrics = pgTable(
  "analytics_metrics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    metricType: text("metric_type", {
      enum: ["user_growth", "content_volume", "top_societies", "moderation"],
    }).notNull(),
    societyId: uuid("society_id").references(() => societies.id, {
      onDelete: "set null",
    }),
    periodStart: timestamp("period_start", { withTimezone: true, mode: "date" }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true, mode: "date" }).notNull(),
    data: jsonb("data").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_analytics_metrics_society_unique").on(
      table.metricType,
      table.societyId,
      table.periodStart,
    ).where(sql`${table.societyId} IS NOT NULL`),
    uniqueIndex("idx_analytics_metrics_platform_unique").on(
      table.metricType,
      table.periodStart,
    ).where(sql`${table.societyId} IS NULL`),
  ],
);
