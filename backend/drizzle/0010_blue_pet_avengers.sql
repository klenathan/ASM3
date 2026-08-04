CREATE TABLE "content_analysis_overrides" (
	"id" uuid PRIMARY KEY NOT NULL,
	"thread_id" uuid NOT NULL,
	"decision" text NOT NULL,
	"actor_id" uuid NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_analysis_overrides_decision_check" CHECK ("content_analysis_overrides"."decision" in ('accept', 'reject'))
);
--> statement-breakpoint
CREATE INDEX "content_analysis_overrides_thread_idx" ON "content_analysis_overrides" USING btree ("thread_id");