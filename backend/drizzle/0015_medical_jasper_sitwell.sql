ALTER TABLE "analytics_refresh_runs" ADD COLUMN "lease_owner" text;--> statement-breakpoint
ALTER TABLE "analytics_refresh_runs" ADD COLUMN "lease_expires_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "idx_analytics_refresh_runs_lease" ON "analytics_refresh_runs" USING btree ("status","lease_expires_at");