ALTER TABLE "threads" ADD COLUMN "location_name" text;--> statement-breakpoint
ALTER TABLE "threads" ADD COLUMN "location_mapbox_id" text;--> statement-breakpoint
ALTER TABLE "threads" ADD COLUMN "location_place_type" text;--> statement-breakpoint
ALTER TABLE "threads" ADD COLUMN "latitude" double precision;--> statement-breakpoint
ALTER TABLE "threads" ADD COLUMN "longitude" double precision;--> statement-breakpoint
ALTER TABLE "threads" ADD COLUMN "location_address" jsonb;--> statement-breakpoint
ALTER TABLE "threads" ADD COLUMN "location_meta" jsonb;--> statement-breakpoint
CREATE INDEX "threads_location_mapbox_id_idx" ON "threads" USING btree ("location_mapbox_id");--> statement-breakpoint
ALTER TABLE "threads" ADD CONSTRAINT "threads_location_all_or_nothing_check" CHECK (("threads"."location_name" IS NULL) = ("threads"."latitude" IS NULL) AND ("threads"."latitude" IS NULL) = ("threads"."longitude" IS NULL) AND ("threads"."latitude" IS NULL) = ("threads"."location_mapbox_id" IS NULL));--> statement-breakpoint
ALTER TABLE "threads" ADD CONSTRAINT "threads_lat_range_check" CHECK ("threads"."latitude" IS NULL OR "threads"."latitude" BETWEEN -90 AND 90);--> statement-breakpoint
ALTER TABLE "threads" ADD CONSTRAINT "threads_lng_range_check" CHECK ("threads"."longitude" IS NULL OR "threads"."longitude" BETWEEN -180 AND 180);