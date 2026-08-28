import { check, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const analyticsRefreshRuns = pgTable(
  "analytics_refresh_runs",
  {
    runId: uuid("run_id").primaryKey(),
    trigger: text("trigger", { enum: ["admin", "nightly"] }).notNull(),
    status: text("status", {
      enum: ["requested", "exporting", "querying", "completed", "failed"],
    }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    glueJobRunId: text("glue_job_run_id"),
    athenaQueryExecutionIds: jsonb("athena_query_execution_ids").notNull().default({}),
  },
  (table) => [
    check(
      "analytics_refresh_runs_attempts_check",
      sql`${table.attempts} >= 0`,
    ),
    check(
      "analytics_refresh_runs_active_status_check",
      sql`${table.status} IN ('requested', 'exporting', 'querying') OR ${table.status} IN ('completed', 'failed')`,
    ),
    uniqueIndex("idx_analytics_refresh_runs_one_active")
      .on(sql`(1)`)
      .where(sql`${table.status} IN ('requested', 'exporting', 'querying')`),
  ],
);
