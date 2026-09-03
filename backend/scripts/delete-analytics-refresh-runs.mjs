#!/usr/bin/env node
/**
 * One-time production cleanup for retrying analytics refresh requests.
 *
 * This permanently deletes every row in analytics_refresh_runs. It does not
 * cancel an already-started AWS workflow; stop that workflow separately if it
 * is still running before requesting a new refresh.
 *
 * Usage from backend/:
 *   NODE_ENV=production pnpm db:delete-refresh-requests -- --dry-run
 *   NODE_ENV=production pnpm db:delete-refresh-requests -- --confirm-prod
 */
import { config as loadDotenv } from "dotenv";
import pg from "pg";

const { Pool } = pg;
const allowedOptions = new Set(["--confirm-prod", "--dry-run", "--help"]);
const rawOptions = process.argv.slice(2);
const options = new Set(rawOptions[0] === "--" ? rawOptions.slice(1) : rawOptions);
const unknownOptions = [...options].filter((option) => !allowedOptions.has(option));

if (unknownOptions.length > 0) {
  throw new Error(`unknown option(s): ${unknownOptions.join(", ")}`);
}

if (options.has("--help")) {
  process.stdout.write(
    "Usage: NODE_ENV=production pnpm db:delete-refresh-requests -- " +
      "[--dry-run | --confirm-prod]\n",
  );
  process.exit(0);
}

if (options.has("--dry-run") === options.has("--confirm-prod")) {
  throw new Error("pass exactly one of --dry-run or --confirm-prod");
}

loadDotenv({ quiet: true });

if (process.env.NODE_ENV !== "production") {
  throw new Error("refusing to run unless NODE_ENV=production");
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required; load the production environment first");
}

const pool = new Pool({
  connectionString: databaseUrl,
  max: 1,
  ...(process.env.DATABASE_SSL === "true"
    ? { ssl: { rejectUnauthorized: true } }
    : {}),
});

try {
  const client = await pool.connect();
  try {
    if (options.has("--dry-run")) {
      const result = await client.query(
        "SELECT count(*)::int AS count FROM public.analytics_refresh_runs",
      );
      process.stdout.write(
        `[analytics-refresh-cleanup] ${result.rows[0].count} row(s) would be deleted\n`,
      );
    } else {
      await client.query("BEGIN");
      try {
        const result = await client.query("DELETE FROM public.analytics_refresh_runs");
        await client.query("COMMIT");
        process.stdout.write(
          `[analytics-refresh-cleanup] deleted ${result.rowCount ?? 0} row(s)\n`,
        );
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}
