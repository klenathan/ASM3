import { desc, sql } from "drizzle-orm";
import {
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

import { authUsers } from "../../identity/infrastructure/auth.tables";
import { mediaAssets } from "../../media/infrastructure/media.tables";
import { societies } from "../../societies/infrastructure/society.tables";

export const threads = pgTable(
  "threads",
  {
    id: uuid("id").primaryKey(),
    societyId: uuid("society_id")
      .notNull()
      .references(() => societies.id, { onDelete: "restrict" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "restrict" }),
    title: varchar("title", { length: 300 }).notNull(),
    body: text("body"),
    status: text("status").notNull().default("published"),
    score: integer("score").notNull().default(0),
    commentCount: integer("comment_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
    locationName: text("location_name"),
    locationMapboxId: text("location_mapbox_id"),
    locationPlaceType: text("location_place_type"),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    locationAddress: jsonb("location_address").$type<Record<string, unknown> | null>(),
    locationMeta: jsonb("location_meta").$type<Record<string, unknown> | null>(),
  },
  (table) => [
    index("threads_society_status_created_id_idx").on(
      table.societyId,
      table.status,
      desc(table.createdAt),
      desc(table.id),
    ),
    index("threads_author_created_idx").on(table.authorId, desc(table.createdAt)),
    index("threads_status_created_id_idx").on(
      table.status,
      desc(table.createdAt),
      desc(table.id),
    ),
    index("threads_location_mapbox_id_idx").on(table.locationMapboxId),
    check("threads_status_check", sql`${table.status} in ('published', 'removed', 'deleted')`),
    check("threads_comment_count_non_negative_check", sql`${table.commentCount} >= 0`),
    check(
      "threads_location_all_or_nothing_check",
      sql`(${table.locationName} IS NULL) = (${table.latitude} IS NULL) AND (${table.latitude} IS NULL) = (${table.longitude} IS NULL) AND (${table.latitude} IS NULL) = (${table.locationMapboxId} IS NULL)`,
    ),
    check("threads_lat_range_check", sql`${table.latitude} IS NULL OR ${table.latitude} BETWEEN -90 AND 90`),
    check("threads_lng_range_check", sql`${table.longitude} IS NULL OR ${table.longitude} BETWEEN -180 AND 180`),
  ],
);

export const comments = pgTable(
  "comments",
  {
    id: uuid("id").primaryKey(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => threads.id, { onDelete: "restrict" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "restrict" }),
    parentId: uuid("parent_id").references((): AnyPgColumn => comments.id, {
      onDelete: "restrict",
    }),
    body: text("body"),
    status: text("status").notNull().default("published"),
    score: integer("score").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    index("comments_thread_created_id_idx").on(
      table.threadId,
      table.createdAt,
      table.id,
    ),
    index("comments_parent_created_id_idx").on(
      table.parentId,
      table.createdAt,
      table.id,
    ),
    check("comments_status_check", sql`${table.status} in ('published', 'removed', 'deleted')`),
  ],
);

export const threadVotes = pgTable(
  "thread_votes",
  {
    threadId: uuid("thread_id")
      .notNull()
      .references(() => threads.id, { onDelete: "restrict" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "restrict" }),
    value: smallint("value").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ name: "thread_votes_pk", columns: [table.threadId, table.userId] }),
    check("thread_votes_value_check", sql`${table.value} in (-1, 1)`),
  ],
);

export const commentVotes = pgTable(
  "comment_votes",
  {
    commentId: uuid("comment_id")
      .notNull()
      .references(() => comments.id, { onDelete: "restrict" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "restrict" }),
    value: smallint("value").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ name: "comment_votes_pk", columns: [table.commentId, table.userId] }),
    check("comment_votes_value_check", sql`${table.value} in (-1, 1)`),
  ],
);

export const threadMedia = pgTable(
  "thread_media",
  {
    threadId: uuid("thread_id")
      .notNull()
      .references(() => threads.id, { onDelete: "restrict" }),
    mediaId: uuid("media_id")
      .notNull()
      .references(() => mediaAssets.id, { onDelete: "restrict" }),
    position: smallint("position").notNull(),
  },
  (table) => [
    primaryKey({ name: "thread_media_pk", columns: [table.threadId, table.mediaId] }),
    uniqueIndex("thread_media_media_id_uidx").on(table.mediaId),
    uniqueIndex("thread_media_thread_position_uidx").on(table.threadId, table.position),
    check("thread_media_position_non_negative_check", sql`${table.position} >= 0`),
  ],
);
