CREATE TABLE "analytics_action_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contract_version" smallint DEFAULT 2 NOT NULL,
	"metric_kind" text NOT NULL,
	"grain" text NOT NULL,
	"society_id" uuid,
	"target_type" text,
	"target_id" uuid,
	"thread_id" uuid,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"snapshot_at" timestamp with time zone,
	"data" jsonb NOT NULL,
	"refresh_run_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "analytics_action_metrics_contract_check" CHECK ("analytics_action_metrics"."contract_version" = 2),
	CONSTRAINT "analytics_action_metrics_dimensions_check" CHECK (("analytics_action_metrics"."grain" = 'platform' AND "analytics_action_metrics"."society_id" IS NULL AND "analytics_action_metrics"."target_id" IS NULL) OR ("analytics_action_metrics"."grain" = 'society' AND "analytics_action_metrics"."society_id" IS NOT NULL AND "analytics_action_metrics"."target_id" IS NULL) OR ("analytics_action_metrics"."grain" = 'content' AND "analytics_action_metrics"."society_id" IS NOT NULL AND "analytics_action_metrics"."target_type" IS NOT NULL AND "analytics_action_metrics"."target_id" IS NOT NULL AND "analytics_action_metrics"."thread_id" IS NOT NULL)),
	CONSTRAINT "analytics_action_metrics_snapshot_check" CHECK (("analytics_action_metrics"."metric_kind" = 'activity' AND "analytics_action_metrics"."snapshot_at" IS NULL) OR ("analytics_action_metrics"."metric_kind" <> 'activity' AND "analytics_action_metrics"."snapshot_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "idx_action_metrics_platform_unique" ON "analytics_action_metrics" USING btree ("contract_version","metric_kind","period_start") WHERE "analytics_action_metrics"."grain" = 'platform';--> statement-breakpoint
CREATE UNIQUE INDEX "idx_action_metrics_society_unique" ON "analytics_action_metrics" USING btree ("contract_version","metric_kind","society_id","period_start") WHERE "analytics_action_metrics"."grain" = 'society';--> statement-breakpoint
CREATE UNIQUE INDEX "idx_action_metrics_content_unique" ON "analytics_action_metrics" USING btree ("contract_version","metric_kind","target_type","target_id","period_start") WHERE "analytics_action_metrics"."grain" = 'content';--> statement-breakpoint
CREATE INDEX "idx_action_metrics_refresh_run" ON "analytics_action_metrics" USING btree ("refresh_run_id");