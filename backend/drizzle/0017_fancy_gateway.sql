CREATE TABLE "action_events" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"schema_version" smallint DEFAULT 1 NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"actor_pseudonym" text NOT NULL,
	"pseudonym_key_version" text NOT NULL,
	"actor_platform_role" text NOT NULL,
	"actor_society_role" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"society_id" uuid,
	"thread_id" uuid,
	"comment_id" uuid,
	"report_id" uuid,
	"correlation_id" text NOT NULL,
	"from_reaction" integer,
	"to_reaction" integer,
	"metadata" jsonb NOT NULL,
	CONSTRAINT "action_events_schema_version_check" CHECK ("action_events"."schema_version" = 1),
	CONSTRAINT "action_events_pseudonym_check" CHECK ("action_events"."actor_pseudonym" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "action_events_key_version_check" CHECK (length("action_events"."pseudonym_key_version") > 0),
	CONSTRAINT "action_events_correlation_check" CHECK (length("action_events"."correlation_id") BETWEEN 1 AND 128),
	CONSTRAINT "action_events_metadata_check" CHECK (jsonb_typeof("action_events"."metadata") = 'object' AND pg_column_size("action_events"."metadata") <= 2048),
	CONSTRAINT "action_events_reaction_values_check" CHECK (("action_events"."from_reaction" IS NULL OR "action_events"."from_reaction" IN (-1, 0, 1)) AND ("action_events"."to_reaction" IS NULL OR "action_events"."to_reaction" IN (-1, 0, 1)) AND ("action_events"."from_reaction" IS NULL OR "action_events"."to_reaction" IS NULL OR "action_events"."from_reaction" <> "action_events"."to_reaction")),
	CONSTRAINT "action_events_reaction_pair_check" CHECK (("action_events"."event_type" IN ('thread_reaction_changed', 'comment_reaction_changed') AND "action_events"."from_reaction" IS NOT NULL AND "action_events"."to_reaction" IS NOT NULL) OR ("action_events"."event_type" NOT IN ('thread_reaction_changed', 'comment_reaction_changed') AND "action_events"."from_reaction" IS NULL AND "action_events"."to_reaction" IS NULL)),
	CONSTRAINT "action_events_dimensions_check" CHECK ((
      ("action_events"."event_type" IN ('thread_created', 'thread_edited', 'thread_deleted', 'thread_reaction_changed') AND "action_events"."target_type" = 'thread' AND "action_events"."society_id" IS NOT NULL AND "action_events"."thread_id" IS NOT NULL)
      OR ("action_events"."event_type" IN ('comment_created', 'comment_edited', 'comment_deleted', 'comment_reaction_changed') AND "action_events"."target_type" = 'comment' AND "action_events"."society_id" IS NOT NULL AND "action_events"."thread_id" IS NOT NULL AND "action_events"."comment_id" IS NOT NULL)
      OR ("action_events"."event_type" IN ('society_membership_joined', 'society_membership_left', 'society_membership_activated') AND "action_events"."target_type" = 'society' AND "action_events"."society_id" IS NOT NULL)
      OR ("action_events"."event_type" = 'society_membership_banned' AND "action_events"."target_type" = 'society' AND "action_events"."society_id" IS NOT NULL AND "action_events"."report_id" IS NOT NULL)
      OR ("action_events"."event_type" = 'report_created' AND "action_events"."target_type" = 'report' AND "action_events"."society_id" IS NOT NULL AND "action_events"."report_id" IS NOT NULL AND "action_events"."thread_id" IS NOT NULL)
      OR ("action_events"."event_type" = 'moderation_report_decided' AND "action_events"."target_type" = 'report' AND "action_events"."society_id" IS NOT NULL AND "action_events"."report_id" IS NOT NULL AND "action_events"."thread_id" IS NOT NULL)
      OR ("action_events"."event_type" = 'moderation_content_removed' AND "action_events"."target_type" IN ('thread', 'comment') AND "action_events"."society_id" IS NOT NULL AND "action_events"."thread_id" IS NOT NULL AND "action_events"."report_id" IS NOT NULL)
    ))
);
--> statement-breakpoint
CREATE TABLE "analytics_contract_state" (
	"contract_version" smallint PRIMARY KEY NOT NULL,
	"recording_started_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "analytics_contract_state_version_check" CHECK ("analytics_contract_state"."contract_version" = 2)
);
--> statement-breakpoint
CREATE INDEX "idx_action_events_occurred_event" ON "action_events" USING btree ("occurred_at","event_id");--> statement-breakpoint
CREATE INDEX "idx_action_events_type_occurred" ON "action_events" USING btree ("event_type","occurred_at");--> statement-breakpoint
CREATE INDEX "idx_action_events_society_occurred" ON "action_events" USING btree ("society_id","occurred_at");--> statement-breakpoint
CREATE INDEX "idx_action_events_target_occurred" ON "action_events" USING btree ("target_type","target_id","occurred_at");
--> statement-breakpoint
INSERT INTO "analytics_contract_state" ("contract_version", "recording_started_at")
VALUES (2, now())
ON CONFLICT ("contract_version") DO NOTHING;