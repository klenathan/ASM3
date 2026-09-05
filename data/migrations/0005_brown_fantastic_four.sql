CREATE TABLE "integration_audit_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"source_event_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"version" integer NOT NULL,
	"thread_id" uuid,
	"society_id" uuid,
	"author_id" uuid,
	"title" varchar(300),
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processing_status" text DEFAULT 'processed' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "integration_audit_events_source_event_id_uidx" ON "integration_audit_events" USING btree ("source_event_id");--> statement-breakpoint
CREATE INDEX "integration_audit_events_thread_idx" ON "integration_audit_events" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "integration_audit_events_received_idx" ON "integration_audit_events" USING btree ("received_at");