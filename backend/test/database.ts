import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { Pool } from "pg";

const MIGRATION_LOCK = 1_947_090_301;

/**
 * Vitest starts integration files concurrently. Keep migration DDL on one
 * PostgreSQL session so concurrent suites cannot create the same table twice.
 */
export async function migrateWithLock(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("select pg_advisory_lock($1)", [MIGRATION_LOCK]);
    await migrate(drizzle({ client }), { migrationsFolder: "./drizzle" });
  } finally {
    await client.query("select pg_advisory_unlock($1)", [MIGRATION_LOCK]);
    client.release();
  }
}
