import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

import type { RefreshRunRecord } from "../application/refresh-orchestrator.ports";
import { DrizzleRefreshRunStore } from "./drizzle-refresh-run.store";

const connectionString = process.env.DATABASE_URL;
const describeWithDb = connectionString === undefined ? describe.skip : describe;

describeWithDb("DrizzleRefreshRunStore", () => {
  let pool: Pool;
  let store: DrizzleRefreshRunStore;

  beforeAll(async () => {
    pool = new Pool({ connectionString });
    const database = drizzle({ client: pool });
    await migrate(database, { migrationsFolder: "./drizzle" });
    store = new DrizzleRefreshRunStore(database);
  });

  afterAll(async () => {
    await pool.query("DELETE FROM analytics_refresh_runs");
    await pool.end();
  });

  it("round-trips persisted query IDs and unfinished status", async () => {
    const run = makeRun("123e4567-e89b-12d3-a456-426614174000");
    await store.save(run);

    await expect(store.get(run.runId)).resolves.toMatchObject({
      runId: run.runId,
      status: "querying",
      athenaQueryExecutionIds: {
        user_growth: "query-1",
        content_volume: "query-2",
      },
    });
  });

  it("converges concurrent first saves on one active run", async () => {
    await pool.query("DELETE FROM analytics_refresh_runs");
    const first = makeRun("123e4567-e89b-12d3-a456-426614174001");
    const second = makeRun("123e4567-e89b-12d3-a456-426614174002");

    const saved = await Promise.all([store.save(first), store.save(second)]);
    expect(new Set(saved.map((run) => run.runId)).size).toBe(1);
    await expect(store.listUnfinishedRuns()).resolves.toHaveLength(1);
  });
});

function makeRun(runId: string): RefreshRunRecord {
  const now = new Date("2026-09-01T00:00:00.000Z");
  return {
    runId,
    trigger: "nightly",
    createdAt: now,
    updatedAt: now,
    status: "querying",
    attempts: 0,
    lastError: null,
    glueJobRunId: "glue-1",
    athenaQueryExecutionIds: {
      user_growth: "query-1",
      content_volume: "query-2",
    },
  };
}
