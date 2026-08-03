import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchAuditEvents, type AuditEvent } from "./audit-api";

const event: AuditEvent = {
  id: "11111111-1111-4111-8111-111111111111",
  sourceEventId: "22222222-2222-4222-8222-222222222222",
  eventType: "thread.created",
  version: 1,
  threadId: "33333333-3333-4333-8333-333333333333",
  societyId: "44444444-4444-4444-8444-444444444444",
  authorId: "55555555-5555-4555-8555-555555555555",
  title: "Welcome thread",
  payload: { threadId: "33333333-3333-4333-8333-333333333333" },
  receivedAt: "2026-08-03T10:00:00.000Z",
  processingStatus: "processed",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("audit trail API", () => {
  it("lists audit events with a cursor and limit", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [event],
          nextCursor: "abc-123",
          hasMore: true,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const page = await fetchAuditEvents({ cursor: "abc", limit: 20 });
    expect(page).toEqual({ items: [event], nextCursor: "abc-123", hasMore: true });

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/v1/admin/audit");
    expect(url).toContain("cursor=abc");
    expect(url).toContain("limit=20");
  });

  it("requests without query params when none are supplied", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ items: [], nextCursor: null, hasMore: false }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const page = await fetchAuditEvents();
    expect(page).toEqual({ items: [], nextCursor: null, hasMore: false });

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/v1/admin/audit");
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

    await expect(fetchAuditEvents()).rejects.toMatchObject({
      code: "ADMIN_REQUIRED",
      status: 403,
    });
  });
});
