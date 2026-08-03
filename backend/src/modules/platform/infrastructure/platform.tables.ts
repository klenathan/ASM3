import { text, timestamp, pgTable } from "drizzle-orm/pg-core";

export const platformConfig = pgTable("platform_config", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
});
