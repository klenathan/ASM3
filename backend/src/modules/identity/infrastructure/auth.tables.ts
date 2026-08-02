import { sql } from "drizzle-orm";
import { check, index, pgTable, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

/**
 * These tables are the minimal database boundary for the authentication
 * adapter. Authentication-specific columns can be added when the adapter is
 * selected without making application modules depend on its implementation.
 */
export const authUsers = pgTable(
  "auth_users",
  {
    id: uuid("id").primaryKey(),
    email: varchar("email", { length: 320 }).notNull(),
    passwordHash: varchar("password_hash", { length: 512 }).notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("auth_users_email_lower_uidx").on(sql`lower(${table.email})`),
    check(
      "auth_users_email_normalized_check",
      sql`${table.email} = lower(btrim(${table.email}))`,
    ),
  ],
);

export const authSessions = pgTable(
  "auth_sessions",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("auth_sessions_user_id_idx").on(table.userId)],
);
