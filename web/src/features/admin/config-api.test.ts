import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchPlatformConfig, updatePlatformConfig } from "./config-api";

const configItem = {
  key: "allowed_email_domains",
  value: "student.rmit.edu.au,rmit.edu.vn",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("admin config API", () => {
  it("parses the platform config page from GET", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ items: [configItem] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchPlatformConfig()).resolves.toEqual({ items: [configItem] });

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/v1/admin/config");
  });

  it("updates a config key with a PUT body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ...configItem, value: "new.domain.edu.au" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      updatePlatformConfig("allowed_email_domains", "new.domain.edu.au"),
    ).resolves.toMatchObject({ value: "new.domain.edu.au" });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/v1/admin/config/allowed_email_domains");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(String(init.body))).toEqual({
      value: "new.domain.edu.au",
    });
  });
});
