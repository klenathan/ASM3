import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { authUsers } from "../../identity/infrastructure/auth.tables.js";

export const societies = pgTable(
  "societies",
  {
    id: uuid("id").primaryKey(),
    slug: varchar("slug", { length: 64 }).notNull(),
    name: varchar("name", { length: 100 }).notNull(),
    description: varchar("description", { length: 1000 }).notNull(),
    status: text("status").notNull().default("active"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => authUsers.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("societies_slug_uidx").on(table.slug),
    index("societies_status_name_idx").on(table.status, table.name),
    check(
      "societies_slug_normalized_check",
      sql`${table.slug} = lower(btrim(${table.slug})) and length(${table.slug}) > 0`,
    ),
    check("societies_status_check", sql`${table.status} in ('active', 'archived')`),
  ],
);

export const societyMemberships = pgTable(
  "society_memberships",
  {
    societyId: uuid("society_id")
      .notNull()
      .references(() => societies.id, { onDelete: "restrict" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "restrict" }),
    role: text("role").notNull().default("member"),
    status: text("status").notNull().default("active"),
    joinedAt: timestamp("joined_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    bannedBy: uuid("banned_by").references(() => authUsers.id, { onDelete: "set null" }),
    bannedAt: timestamp("banned_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    primaryKey({
      name: "society_memberships_pk",
      columns: [table.societyId, table.userId],
    }),
    index("society_memberships_user_status_idx").on(table.userId, table.status),
    index("society_memberships_society_role_status_idx").on(
      table.societyId,
      table.role,
      table.status,
    ),
    check(
      "society_memberships_role_check",
      sql`${table.role} in ('member', 'moderator')`,
    ),
    check(
      "society_memberships_status_check",
      sql`${table.status} in ('active', 'left', 'banned')`,
    ),
  ],
);

export const societyRules = pgTable(
  "society_rules",
  {
    id: uuid("id").primaryKey(),
    societyId: uuid("society_id")
      .notNull()
      .references(() => societies.id, { onDelete: "cascade" }),
    position: smallint("position").notNull(),
    title: varchar("title", { length: 100 }).notNull(),
    description: varchar("description", { length: 500 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("society_rules_society_position_uidx").on(table.societyId, table.position),
    check("society_rules_position_check", sql`${table.position} > 0`),
  ],
);
