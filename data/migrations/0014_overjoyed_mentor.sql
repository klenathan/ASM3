CREATE TABLE "analytics_refresh_runs" (
	"run_id" uuid PRIMARY KEY NOT NULL,
	"trigger" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"glue_job_run_id" text,
	"athena_query_execution_ids" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "analytics_refresh_runs_attempts_check" CHECK ("analytics_refresh_runs"."attempts" >= 0),
	CONSTRAINT "analytics_refresh_runs_active_status_check" CHECK ("analytics_refresh_runs"."status" IN ('requested', 'exporting', 'querying') OR "analytics_refresh_runs"."status" IN ('completed', 'failed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "idx_analytics_refresh_runs_one_active" ON "analytics_refresh_runs" USING btree ((1)) WHERE "analytics_refresh_runs"."status" IN ('requested', 'exporting', 'querying');