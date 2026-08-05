import { describe, expect, it } from "vitest";

import { loadConfig } from "../src/config/env";

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

  it("loads remote media bucket configuration as a pair", () => {
    expect(loadConfig({
      DATABASE_URL: databaseUrl,
      AWS_REGION: "us-east-1",
      MEDIA_BUCKET: "rmit-society-media",
    })).toMatchObject({
      awsRegion: "us-east-1",
      mediaBucket: "rmit-society-media",
    });
    expect(() => loadConfig({
      DATABASE_URL: databaseUrl,
      MEDIA_BUCKET: "rmit-society-media",
    })).toThrow("AWS_REGION and MEDIA_BUCKET must be configured together");
  });

  it("requires remote media storage in production", () => {
    expect(() => loadConfig({
      DATABASE_URL: databaseUrl,
      NODE_ENV: "production",
    })).toThrow("is required in production");
  });

  it("rejects non-PostgreSQL database URLs", () => {
    expect(() => loadConfig({ DATABASE_URL: "https://example.com/database" })).toThrow(
      "must be a valid PostgreSQL connection URL",
    );
  });

  it("defaults content-analysis auto-remove confidence to 0.90", () => {
    expect(loadConfig({ DATABASE_URL: databaseUrl }).contentAnalysisAutoRemoveConfidence).toBe(
      0.9,
    );
  });

  it("parses an explicit auto-remove confidence", () => {
    expect(
      loadConfig({
        DATABASE_URL: databaseUrl,
        CONTENT_ANALYSIS_AUTO_REMOVE_CONFIDENCE: "0.85",
      }).contentAnalysisAutoRemoveConfidence,
    ).toBe(0.85);
  });

  it("rejects auto-remove confidence below 0 or above 1", () => {
    expect(() =>
      loadConfig({
        DATABASE_URL: databaseUrl,
        CONTENT_ANALYSIS_AUTO_REMOVE_CONFIDENCE: "-0.1",
      }),
    ).toThrow();
    expect(() =>
      loadConfig({
        DATABASE_URL: databaseUrl,
        CONTENT_ANALYSIS_AUTO_REMOVE_CONFIDENCE: "1.1",
      }),
    ).toThrow();
  });
});
