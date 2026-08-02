import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import type { Logger } from "pino";

import type { AppConfig } from "../config/env";
import { SERVICE_NAME } from "../constants";

export function createDatabase(config: AppConfig, logger: Logger) {
  const pool = new Pool({
    connectionString: config.databaseUrl,
    application_name: SERVICE_NAME,
    max: config.databasePoolMax,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    ...(config.databaseSsl
      ? {
          ssl: {
            rejectUnauthorized: true,
          },
        }
      : {}),
  });

  pool.on("error", (error) => {
    logger.error({ err: error }, "unexpected idle PostgreSQL client error");
  });

  const db = drizzle({ client: pool });

  return {
    db,
    pool,
    async checkConnection(): Promise<void> {
      await pool.query("select 1");
    },
    async close(): Promise<void> {
      await pool.end();
    },
  };
}

export type Database = ReturnType<typeof createDatabase>["db"];
