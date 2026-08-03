import { afterEach, describe, expect, it, vi } from "vitest";

import {
  claimReport,
  dismissReport,
  fetchReports,
  resolveReport,
  type Report,
} from "./moderation-api";

const report: Report = {
  id: "11111111-1111-4111-8111-111111111111",
  societyId: "22222222-2222-4222-8222-222222222222",
  reporterId: "33333333-3333-4333-8333-333333333333",
  threadId: "44444444-4444-4444-8444-444444444444",
  commentId: null,
  targetType: "thread",
  targetId: "44444444-4444-4444-8444-444444444444",
  reason: "Spam",
  details: "Repeated promotional posts.",
  status: "pending",
  assignedTo: null,
  resolution: null,
  resolutionNote: null,
  createdAt: "2026-08-02T00:00:00.000Z",
  updatedAt: "2026-08-02T00:00:00.000Z",
  resolvedAt: null,
  resolvedBy: null,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("moderation queue API", () => {
  it("lists reports with a status and cursor", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [report],
          nextCursor: "abc-123",
          hasMore: true,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const page = await fetchReports({ status: "pending", cursor: "abc", limit: 20 });
    expect(page).toEqual({ items: [report], nextCursor: "abc-123", hasMore: true });

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/v1/admin/reports");
    expect(url).toContain("status=pending");
    expect(url).toContain("cursor=abc");
    expect(url).toContain("limit=20");
  });

  it("claims a report with a POST and no body", async () => {
    const claimed = { ...report, status: "in_review", assignedTo: "sys-1" };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(claimed), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(claimReport(report.id)).resolves.toEqual(claimed);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(`/api/v1/mod/reports/${report.id}/claim`);
    expect(init.method).toBe("POST");
    expect(init.body).toBeUndefined();
  });

  it("resolves a report with an action and note", async () => {
    const resolved = { ...report, status: "resolved", resolution: "remove_content" };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(resolved), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await resolveReport(report.id, {
      action: "remove_content",
      resolutionNote: "Removed the post.",
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(`/api/v1/mod/reports/${report.id}/resolve`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      action: "remove_content",
      resolutionNote: "Removed the post.",
    });
  });

  it("resolves a report with a suspension window", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(report), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await resolveReport(report.id, {
      action: "suspend_user",
      suspendedUntil: "2026-08-10T12:00",
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({
      action: "suspend_user",
      suspendedUntil: "2026-08-10T12:00",
    });
  });

  it("dismisses a report with an optional note", async () => {
    const dismissed = { ...report, status: "dismissed" };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(dismissed), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await dismissReport(report.id, { resolutionNote: "Not actionable." });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(`/api/v1/mod/reports/${report.id}/dismiss`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ resolutionNote: "Not actionable." });
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

    await expect(fetchReports({ status: "pending" })).rejects.toMatchObject({
      code: "ADMIN_REQUIRED",
      status: 403,
    });
  });
});
