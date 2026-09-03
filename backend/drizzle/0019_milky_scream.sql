ALTER TABLE "analytics_refresh_runs" ADD COLUMN "contract_version" smallint DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE "analytics_refresh_runs" ADD COLUMN "period_start" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "analytics_refresh_runs" ADD COLUMN "period_end" timestamp with time zone;