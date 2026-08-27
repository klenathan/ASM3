import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.length === 0) {
  throw new Error("DATABASE_URL is required for migrations");
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: true } : undefined,
});

async function main(): Promise<void> {
  await normalizePlatformAnalyticsDuplicates();
  await migrate(drizzle({ client: pool }), { migrationsFolder: "./drizzle" });
}

async function normalizePlatformAnalyticsDuplicates(): Promise<void> {
  const table = await pool.query<{ regclass: string | null }>(
    "SELECT to_regclass('public.analytics_metrics')::text AS regclass",
  );
  if (table.rows[0]?.regclass === null || table.rows[0]?.regclass === undefined) return;

  const index = await pool.query<{ indexname: string | null }>(
    "SELECT to_regclass('public.idx_analytics_metrics_platform_unique')::text AS indexname",
  );
  if (index.rows[0]?.indexname !== null && index.rows[0]?.indexname !== undefined) return;

  // Migration 0013 replaces the old nullable-key index. Keep the newest
  // normalized row for each platform metric before PostgreSQL builds it.
  await pool.query(`
    DELETE FROM analytics_metrics
    WHERE id IN (
      SELECT id
      FROM (
        SELECT id,
          row_number() OVER (
            PARTITION BY metric_type, period_start
            ORDER BY updated_at DESC, created_at DESC, id DESC
          ) AS duplicate_number
        FROM analytics_metrics
        WHERE society_id IS NULL
      ) duplicates
      WHERE duplicate_number > 1
    )
  `);
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
