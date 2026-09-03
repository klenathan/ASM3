import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { migrateWithLock } from "../../../../test/database";
import { DrizzlePlatformConfigRepository } from "./drizzle-platform.repository";

// PostgreSQL integration coverage for the platform_config upsert/primary-key
// behavior. These run only when DATABASE_URL is provided.
const connectionString = process.env.DATABASE_URL;
const describeWithDb = connectionString === undefined ? describe.skip : describe;

describeWithDb("platform_config repository", () => {
  let pool: Pool;
  let repository: DrizzlePlatformConfigRepository;

  beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const db = drizzle({ client: pool });
    await migrateWithLock(pool);
    repository = new DrizzlePlatformConfigRepository(db);
  });

  afterAll(async () => {
    if (pool !== undefined) await pool.end();
  });

  it("upserts a single row per key", async () => {
    const key = "allowed_email_domains";
    const first = await repository.upsertConfig({ key, value: "rmit.edu.au", updatedAt: new Date() });
    const second = await repository.upsertConfig({ key, value: "rmit.edu.au,rmit.edu.vn", updatedAt: new Date() });

    const found = await repository.findConfig(key);
    expect(found?.value).toBe("rmit.edu.au,rmit.edu.vn");
    expect(second.key).toBe(first.key);
    expect((await repository.listConfigs()).filter((row) => row.key === key)).toHaveLength(1);

    await pool.query("delete from platform_config where key = $1", [key]);
  });
});
