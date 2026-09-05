DROP INDEX "idx_analytics_refresh_runs_lease";--> statement-breakpoint
ALTER TABLE "analytics_refresh_runs" DROP COLUMN "lease_owner";--> statement-breakpoint
ALTER TABLE "analytics_refresh_runs" DROP COLUMN "lease_expires_at";