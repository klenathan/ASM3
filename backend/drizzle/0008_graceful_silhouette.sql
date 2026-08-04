CREATE TABLE "content_analysis_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"source_event_id" uuid NOT NULL,
	"run_number" integer DEFAULT 1 NOT NULL,
	"trigger_type" text NOT NULL,
	"thread_id" uuid NOT NULL,
	"report_id" uuid,
	"status" text DEFAULT 'queued' NOT NULL,
	"decision" text,
	"sentiment_label" text,
	"confidence" jsonb,
	"findings" jsonb,
	"input_snapshot" jsonb,
	"input_hash" text,
	"model_id" text,
	"lambda_function_version" text,
	"lambda_request_id" text,
	"prompt_version" text,
	"policy_version" text,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"error_code" text,
	"context_captured_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "content_analysis_runs_source_run_uidx" ON "content_analysis_runs" USING btree ("source_event_id","run_number");--> statement-breakpoint
CREATE INDEX "content_analysis_runs_thread_idx" ON "content_analysis_runs" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "content_analysis_runs_report_idx" ON "content_analysis_runs" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX "content_analysis_runs_status_created_idx" ON "content_analysis_runs" USING btree ("status","created_at");