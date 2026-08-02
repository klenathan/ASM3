import { config as loadDotenv } from "dotenv";
import { defineConfig } from "drizzle-kit";

loadDotenv({ quiet: true });

const configuredDatabaseUrl = process.env.DATABASE_URL;

if (!configuredDatabaseUrl) {
  throw new Error("DATABASE_URL is required for Drizzle commands");
}

const databaseUrl = new URL(configuredDatabaseUrl);

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    host: databaseUrl.hostname,
    port: databaseUrl.port === "" ? 5432 : Number(databaseUrl.port),
    user: decodeURIComponent(databaseUrl.username),
    password: decodeURIComponent(databaseUrl.password),
    database: decodeURIComponent(databaseUrl.pathname.slice(1)),
    ssl: process.env.DATABASE_SSL === "true" ? "verify-full" : false,
  },
  strict: true,
  verbose: true,
});
