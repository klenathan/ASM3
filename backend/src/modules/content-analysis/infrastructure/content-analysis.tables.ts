import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * One row per content-analysis run. Unique on (source_event_id, run_number)
 * to support explicit reanalysis without duplicating a source event.
 */
export const contentAnalysisRuns = pgTable(
  "content_analysis_runs",
  {
    id: uuid("id").primaryKey(),
    sourceEventId: uuid("source_event_id").notNull(),
    runNumber: integer("run_number").notNull().default(1),
    triggerType: text("trigger_type").notNull(),
    threadId: uuid("thread_id").notNull(),
    reportId: uuid("report_id"),
    status: text("status").notNull().default("queued"),
    decision: text("decision"),
    sentimentLabel: text("sentiment_label"),
    confidence: jsonb("confidence").$type<number | null>(),
    findings: jsonb("findings").$type<unknown[] | null>(),
    summary: text("summary"),
    rationale: text("rationale"),
    providerRequestId: text("provider_request_id"),
    inputSnapshot: jsonb("input_snapshot").$type<Record<string, unknown> | null>(),
    inputHash: text("input_hash"),
    modelId: text("model_id"),
    lambdaFunctionVersion: text("lambda_function_version"),
    lambdaRequestId: text("lambda_request_id"),
    promptVersion: text("prompt_version"),
    policyVersion: text("policy_version"),
    attemptCount: integer("attempt_count").notNull().default(0),
    errorCode: text("error_code"),
    contextCapturedAt: timestamp("context_captured_at", { withTimezone: true, mode: "date" }),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("content_analysis_runs_source_run_uidx")
      .on(table.sourceEventId, table.runNumber),
    index("content_analysis_runs_thread_idx").on(table.threadId),
    index("content_analysis_runs_report_idx").on(table.reportId),
    index("content_analysis_runs_status_created_idx")
      .on(table.status, table.createdAt),
  ],
);

/**
 * One row per human override of the automated content-analysis decision for a
 * thread. The latest override per thread is authoritative for moderation.
 */
export const contentAnalysisOverrides = pgTable(
  "content_analysis_overrides",
  {
    id: uuid("id").primaryKey(),
    threadId: uuid("thread_id").notNull(),
    decision: text("decision").notNull(),
    actorId: uuid("actor_id").notNull(),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("content_analysis_overrides_thread_idx").on(table.threadId),
    check(
      "content_analysis_overrides_decision_check",
      sql`${table.decision} in ('accept', 'reject')`,
    ),
  ],
);
