import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchHealth } from "./health-api";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("health API", () => {
  it("fetches and parses the platform health snapshot", async () => {
    const payload = {
      status: "ok",
      database: "ok",
      uptimeSeconds: 125000,
      serverTime: "2026-08-03T10:00:00.000Z",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(payload), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(fetchHealth()).resolves.toEqual(payload);

    const fetchMock = vi.mocked(fetch);
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/v1/admin/health");
  });

  it("propagates a degraded database state", async () => {
    const payload = {
      status: "ok",
      database: "degraded",
      uptimeSeconds: 100,
      serverTime: "2026-08-03T10:00:00.000Z",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(payload), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    const snapshot = await fetchHealth();
    expect(snapshot.database).toBe("degraded");
  });

  it("propagates a 403 as an ADMIN_REQUIRED error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: { code: "ADMIN_REQUIRED", message: "Admins only." },
          }),
          { status: 403, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    await expect(fetchHealth()).rejects.toMatchObject({
      code: "ADMIN_REQUIRED",
      status: 403,
    });
  });
});
