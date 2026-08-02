CREATE TABLE "auth_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" varchar(320) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_users_email_normalized_check" CHECK ("auth_users"."email" = lower(btrim("auth_users"."email")))
);
--> statement-breakpoint
CREATE TABLE "comment_votes" (
	"comment_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"value" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comment_votes_pk" PRIMARY KEY("comment_id","user_id"),
	CONSTRAINT "comment_votes_value_check" CHECK ("comment_votes"."value" in (-1, 1))
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"thread_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"parent_id" uuid,
	"body" text,
	"status" text DEFAULT 'published' NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "comments_status_check" CHECK ("comments"."status" in ('published', 'removed', 'deleted'))
);
--> statement-breakpoint
CREATE TABLE "media_assets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"object_key" varchar(512) NOT NULL,
	"purpose" text NOT NULL,
	"content_type" varchar(100) NOT NULL,
	"byte_size" bigint NOT NULL,
	"checksum" varchar(128),
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "media_assets_purpose_check" CHECK ("media_assets"."purpose" in ('thread_attachment', 'avatar')),
	CONSTRAINT "media_assets_byte_size_positive_check" CHECK ("media_assets"."byte_size" > 0),
	CONSTRAINT "media_assets_status_check" CHECK ("media_assets"."status" in ('pending', 'ready', 'quarantined', 'deleted'))
);
--> statement-breakpoint
CREATE TABLE "moderation_actions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"society_id" uuid,
	"actor_id" uuid NOT NULL,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"reason" varchar(1000) NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "moderation_actions_target_type_check" CHECK ("moderation_actions"."target_type" in ('user', 'membership', 'thread', 'comment', 'report'))
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"society_id" uuid NOT NULL,
	"reporter_id" uuid NOT NULL,
	"thread_id" uuid,
	"comment_id" uuid,
	"reason" text NOT NULL,
	"details" varchar(1000),
	"status" text DEFAULT 'pending' NOT NULL,
	"assigned_to" uuid,
	"resolution" text,
	"resolution_note" varchar(1000),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid,
	CONSTRAINT "reports_exactly_one_target_check" CHECK (("reports"."thread_id" is not null) <> ("reports"."comment_id" is not null)),
	CONSTRAINT "reports_status_check" CHECK ("reports"."status" in ('pending', 'in_review', 'resolved', 'dismissed'))
);
--> statement-breakpoint
CREATE TABLE "societies" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" varchar(64) NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" varchar(1000) NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "societies_slug_normalized_check" CHECK ("societies"."slug" = lower(btrim("societies"."slug")) and length("societies"."slug") > 0),
	CONSTRAINT "societies_status_check" CHECK ("societies"."status" in ('active', 'archived'))
);
--> statement-breakpoint
CREATE TABLE "society_memberships" (
	"society_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"banned_by" uuid,
	"banned_at" timestamp with time zone,
	CONSTRAINT "society_memberships_pk" PRIMARY KEY("society_id","user_id"),
	CONSTRAINT "society_memberships_role_check" CHECK ("society_memberships"."role" in ('member', 'moderator')),
	CONSTRAINT "society_memberships_status_check" CHECK ("society_memberships"."status" in ('active', 'left', 'banned'))
);
--> statement-breakpoint
CREATE TABLE "society_rules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"society_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"title" varchar(100) NOT NULL,
	"description" varchar(500) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "society_rules_position_check" CHECK ("society_rules"."position" > 0)
);
--> statement-breakpoint
CREATE TABLE "thread_media" (
	"thread_id" uuid NOT NULL,
	"media_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	CONSTRAINT "thread_media_pk" PRIMARY KEY("thread_id","media_id"),
	CONSTRAINT "thread_media_position_non_negative_check" CHECK ("thread_media"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "thread_votes" (
	"thread_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"value" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "thread_votes_pk" PRIMARY KEY("thread_id","user_id"),
	CONSTRAINT "thread_votes_value_check" CHECK ("thread_votes"."value" in (-1, 1))
);
--> statement-breakpoint
CREATE TABLE "threads" (
	"id" uuid PRIMARY KEY NOT NULL,
	"society_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"title" varchar(300) NOT NULL,
	"body" text,
	"status" text DEFAULT 'published' NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"comment_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "threads_status_check" CHECK ("threads"."status" in ('published', 'removed', 'deleted')),
	CONSTRAINT "threads_comment_count_non_negative_check" CHECK ("threads"."comment_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"display_name" varchar(80) NOT NULL,
	"bio" varchar(500),
	"avatar_media_id" uuid,
	"platform_role" text DEFAULT 'student' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"suspended_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_profiles_display_name_check" CHECK ("user_profiles"."display_name" = btrim("user_profiles"."display_name") and length("user_profiles"."display_name") > 0),
	CONSTRAINT "user_profiles_platform_role_check" CHECK ("user_profiles"."platform_role" in ('student', 'system_admin')),
	CONSTRAINT "user_profiles_status_check" CHECK ("user_profiles"."status" in ('active', 'suspended', 'deactivated'))
);
--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_votes" ADD CONSTRAINT "comment_votes_comment_id_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_votes" ADD CONSTRAINT "comment_votes_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_auth_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."auth_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_parent_id_comments_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."comments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_owner_id_auth_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."auth_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_society_id_societies_id_fk" FOREIGN KEY ("society_id") REFERENCES "public"."societies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_actor_id_auth_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."auth_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_society_id_societies_id_fk" FOREIGN KEY ("society_id") REFERENCES "public"."societies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_auth_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."auth_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_comment_id_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_assigned_to_auth_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."auth_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_resolved_by_auth_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."auth_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "societies" ADD CONSTRAINT "societies_created_by_auth_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."auth_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "society_memberships" ADD CONSTRAINT "society_memberships_society_id_societies_id_fk" FOREIGN KEY ("society_id") REFERENCES "public"."societies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "society_memberships" ADD CONSTRAINT "society_memberships_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "society_memberships" ADD CONSTRAINT "society_memberships_banned_by_auth_users_id_fk" FOREIGN KEY ("banned_by") REFERENCES "public"."auth_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "society_rules" ADD CONSTRAINT "society_rules_society_id_societies_id_fk" FOREIGN KEY ("society_id") REFERENCES "public"."societies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thread_media" ADD CONSTRAINT "thread_media_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thread_media" ADD CONSTRAINT "thread_media_media_id_media_assets_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thread_votes" ADD CONSTRAINT "thread_votes_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thread_votes" ADD CONSTRAINT "thread_votes_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads" ADD CONSTRAINT "threads_society_id_societies_id_fk" FOREIGN KEY ("society_id") REFERENCES "public"."societies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads" ADD CONSTRAINT "threads_author_id_auth_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."auth_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_avatar_media_id_media_assets_id_fk" FOREIGN KEY ("avatar_media_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_sessions_user_id_idx" ON "auth_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_users_email_lower_uidx" ON "auth_users" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "comments_thread_created_id_idx" ON "comments" USING btree ("thread_id","created_at","id");--> statement-breakpoint
CREATE INDEX "comments_parent_created_id_idx" ON "comments" USING btree ("parent_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "media_assets_object_key_uidx" ON "media_assets" USING btree ("object_key");--> statement-breakpoint
CREATE INDEX "moderation_actions_society_created_idx" ON "moderation_actions" USING btree ("society_id","created_at" desc);--> statement-breakpoint
CREATE INDEX "moderation_actions_target_created_idx" ON "moderation_actions" USING btree ("target_type","target_id","created_at" desc);--> statement-breakpoint
CREATE UNIQUE INDEX "reports_active_thread_reporter_target_uidx" ON "reports" USING btree ("reporter_id","thread_id") WHERE "reports"."status" in ('pending', 'in_review') and "reports"."thread_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "reports_active_comment_reporter_target_uidx" ON "reports" USING btree ("reporter_id","comment_id") WHERE "reports"."status" in ('pending', 'in_review') and "reports"."comment_id" is not null;--> statement-breakpoint
CREATE INDEX "reports_society_status_created_id_idx" ON "reports" USING btree ("society_id","status","created_at","id");--> statement-breakpoint
CREATE INDEX "reports_reporter_created_idx" ON "reports" USING btree ("reporter_id","created_at" desc);--> statement-breakpoint
CREATE UNIQUE INDEX "societies_slug_uidx" ON "societies" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "societies_status_name_idx" ON "societies" USING btree ("status","name");--> statement-breakpoint
CREATE INDEX "society_memberships_user_status_idx" ON "society_memberships" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "society_memberships_society_role_status_idx" ON "society_memberships" USING btree ("society_id","role","status");--> statement-breakpoint
CREATE UNIQUE INDEX "society_rules_society_position_uidx" ON "society_rules" USING btree ("society_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "thread_media_media_id_uidx" ON "thread_media" USING btree ("media_id");--> statement-breakpoint
CREATE UNIQUE INDEX "thread_media_thread_position_uidx" ON "thread_media" USING btree ("thread_id","position");--> statement-breakpoint
CREATE INDEX "threads_society_status_created_id_idx" ON "threads" USING btree ("society_id","status","created_at" desc,"id" desc);--> statement-breakpoint
CREATE INDEX "threads_author_created_idx" ON "threads" USING btree ("author_id","created_at" desc);--> statement-breakpoint
CREATE INDEX "threads_status_created_id_idx" ON "threads" USING btree ("status","created_at" desc,"id" desc);