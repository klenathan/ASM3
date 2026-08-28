import { describe, expect, it } from "vitest";

import { createWorkflowPoolOptions } from "./workflow-database";

describe("analytics workflow database connection", () => {
  it("enables verified TLS for the RDS connection", () => {
    expect(createWorkflowPoolOptions("postgresql://db.example/rmit_society")).toMatchObject({
      connectionString: "postgresql://db.example/rmit_society",
      max: 1,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
      ssl: { rejectUnauthorized: true },
    });
  });
});
