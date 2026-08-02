import { Writable } from "node:stream";

import pino from "pino";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app";
import { societyErrorResponse } from "../src/modules/societies/presentation/http.helpers";

const logger = pino({ level: "silent" });
const config = { webOrigin: "http://localhost:5173" };

describe("health API", () => {
  it("reports liveness without checking dependencies", async () => {
    const app = createApp({
      config,
      logger,
      checkReadiness: async () => {
        throw new Error("must not be called");
      },
    });

    const response = await app.request("/api/v1/health/live");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: "ok",
      service: "rmit-society-api",
    });
  });

  it("reports readiness when dependencies are available", async () => {
    const app = createApp({
      config,
      logger,
      checkReadiness: async () => undefined,
    });

    const response = await app.request("/api/v1/health/ready");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: "ok" });
  });

  it("returns 503 without leaking dependency errors", async () => {
    const app = createApp({
      config,
      logger,
      checkReadiness: async () => {
        throw new Error("database password must stay private");
      },
    });

    const response = await app.request("/api/v1/health/ready");
    const text = await response.text();

    expect(response.status).toBe(503);
    expect(text).not.toContain("database password");
    expect(JSON.parse(text)).toMatchObject({ status: "error" });
  });

  it("logs caught 500 error details without exposing them to clients", async () => {
    const logEntries: Record<string, unknown>[] = [];
    const logStream = new Writable({
      write(chunk, _encoding, callback) {
        logEntries.push(JSON.parse(chunk.toString()) as Record<string, unknown>);
        callback();
      },
    });
    const errorLogger = pino({ level: "info" }, logStream);
    const app = createApp({
      config,
      logger: errorLogger,
      checkReadiness: async () => undefined,
    });
    app.get("/test/caught-error", (context) =>
      societyErrorResponse(context, new Error("database password must stay private")),
    );

    const response = await app.request("/test/caught-error");
    const responseText = await response.text();
    const failureLog = logEntries.find((entry) => entry.msg === "request failed");

    expect(response.status).toBe(500);
    expect(responseText).not.toContain("database password");
    expect(failureLog).toMatchObject({
      level: 50,
      msg: "request failed",
      err: {
        type: "Error",
        message: "database password must stay private",
      },
    });
    expect(failureLog?.requestId).toBeTypeOf("string");
    const loggedError = failureLog?.err as { stack?: string } | undefined;
    expect(loggedError?.stack).toContain("database password must stay private");
  });

  it("publishes an OpenAPI 3.1 document", async () => {
    const app = createApp({
      config,
      logger,
      checkReadiness: async () => undefined,
    });

    const response = await app.request("/api/v1/openapi.json");
    const document = (await response.json()) as {
      openapi: string;
      info: { title: string; version: string };
      paths: Record<string, unknown>;
    };

    expect(response.status).toBe(200);
    expect(document.openapi).toBe("3.1.0");
    expect(document.info).toMatchObject({
      title: "RMIT Society API",
      version: "0.1.0",
    });
    expect(document.paths).toHaveProperty("/api/v1/health/live");
    expect(document.paths).toHaveProperty("/api/v1/health/ready");

    const docsResponse = await app.request("/docs");
    const docsHtml = await docsResponse.text();

    expect(docsResponse.status).toBe(200);
    expect(docsResponse.headers.get("content-type")).toContain("text/html");
    expect(docsHtml).toContain("/api/v1/openapi.json");
  });
});
