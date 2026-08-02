import { sql } from "drizzle-orm";
import { boolean, check, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

import { mediaAssets } from "../../media/infrastructure/media.tables";
import { authUsers } from "./auth.tables";

export const userProfiles = pgTable(
  "user_profiles",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => authUsers.id, { onDelete: "restrict" }),
    displayName: varchar("display_name", { length: 80 }).notNull(),
    bio: varchar("bio", { length: 500 }),
    avatarMediaId: uuid("avatar_media_id").references(() => mediaAssets.id, {
      onDelete: "set null",
    }),
    platformRole: text("platform_role").notNull().default("student"),
    status: text("status").notNull().default("active"),
    isPublic: boolean("is_public").notNull().default(true),
    suspendedUntil: timestamp("suspended_until", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "user_profiles_display_name_check",
      sql`${table.displayName} = btrim(${table.displayName}) and length(${table.displayName}) > 0`,
    ),
    check(
      "user_profiles_platform_role_check",
      sql`${table.platformRole} in ('student', 'system_admin')`,
    ),
    check(
      "user_profiles_status_check",
      sql`${table.status} in ('active', 'suspended', 'deactivated')`,
    ),
  ],
);
