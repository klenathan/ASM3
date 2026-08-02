import { describe, expect, it } from "vitest";

import { loadConfig } from "../src/config/env.js";

const databaseUrl = "postgresql://user:password@localhost:5432/rmit_society";

describe("environment configuration", () => {
  it("loads safe local defaults", () => {
    const config = loadConfig({ DATABASE_URL: databaseUrl });

    expect(config).toMatchObject({
      nodeEnv: "development",
      host: "0.0.0.0",
      port: 3000,
      databaseSsl: false,
      databasePoolMax: 10,
    });
  });

  it("parses explicit SSL without treating false as truthy", () => {
    expect(loadConfig({ DATABASE_URL: databaseUrl, DATABASE_SSL: "false" }).databaseSsl).toBe(false);
    expect(loadConfig({ DATABASE_URL: databaseUrl, DATABASE_SSL: "true" }).databaseSsl).toBe(true);
  });

  it("rejects non-PostgreSQL database URLs", () => {
    expect(() => loadConfig({ DATABASE_URL: "https://example.com/database" })).toThrow(
      "must be a valid PostgreSQL connection URL",
    );
  });
});
