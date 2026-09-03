import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AnalyticsSection } from "./analytics-section";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function emptyPage() {
  return { metrics: [], page: { cursor: null, hasMore: false } };
}


function mockFetch(
  handler: (url: string, init?: RequestInit) => Response,
) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(handler(String(input), init)),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    user: userEvent.setup(),
    ...render(
      <QueryClientProvider client={client}>
        <AnalyticsSection />
      </QueryClientProvider>,
    ),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AnalyticsSection", () => {
  it("shows a warning when refresh skips dates before retained events", async () => {
    mockFetch((url, init) => {
      if (url.endsWith("/api/v2/admin/analytics/refresh") && init?.method === "POST") {
        return jsonResponse({
          accepted: true,
          message: "Analytics refresh has been queued.",
          warnings: ["Requested range starts before retained action events; skipped dates before 2026-09-03."],
          runId: "22222222-2222-4222-8222-222222222222",
          status: "requested",
        });
      }
      return jsonResponse(emptyPage());
    });
    const { user } = setup();

    await user.click(screen.getByRole("button", { name: "Refresh analytics" }));

    expect(
      await screen.findByText(
        "Warning: Requested range starts before retained action events; skipped dates before 2026-09-03.",
        { selector: '[role="status"]' },
      ),
    ).toBeInTheDocument();
  });
  it("shows the latest v2 refresh status after loading the admin panel", async () => {
    mockFetch((url) => {
      if (url.endsWith("/api/v2/admin/analytics/refresh/status")) {
        return jsonResponse({
          runId: "33333333-3333-4333-8333-333333333333",
          trigger: "admin",
          status: "exporting",
          attempts: 1,
          lastError: null,
          createdAt: "2026-09-03T00:00:00.000Z",
          updatedAt: "2026-09-03T00:01:00.000Z",
          periodStart: "2026-09-01",
          periodEnd: "2026-09-04",
        });
      }
      return jsonResponse(emptyPage());
    });
    setup();

    expect(await screen.findByText("Exporting snapshot")).toBeInTheDocument();
    expect(await screen.findByText("2026-09-01 to 2026-09-04")).toBeInTheDocument();
  });
  it("cancels an active v2 refresh", async () => {
    let cancelRequests = 0;
    mockFetch((url, init) => {
      if (url.endsWith("/api/v2/admin/analytics/refresh/status")) {
        return jsonResponse({
          runId: "44444444-4444-4444-8444-444444444444",
          trigger: "admin",
          status: "querying",
          attempts: 1,
          lastError: null,
          createdAt: "2026-09-03T00:00:00.000Z",
          updatedAt: "2026-09-03T00:01:00.000Z",
          periodStart: "2026-09-03",
          periodEnd: "2026-09-04",
        });
      }
      if (url.endsWith("/api/v2/admin/analytics/refresh/cancel") && init?.method === "POST") {
        cancelRequests += 1;
        return jsonResponse({
          cancelled: true,
          message: "Analytics refresh was cancelled.",
          runId: "44444444-4444-4444-8444-444444444444",
          status: "cancelled",
        });
      }
      return jsonResponse(emptyPage());
    });
    const { user } = setup();

    await user.click(await screen.findByRole("button", { name: "Cancel refresh" }));

    expect(cancelRequests).toBe(1);
    expect(await screen.findByText("Analytics refresh was cancelled.")).toBeInTheDocument();
  });


  it("renders metric cards with icons and info tooltip explanations", async () => {
    mockFetch((url) => {
      if (url.includes("/api/v2/admin/analytics?") || url.endsWith("/api/v2/admin/analytics")) {
        return jsonResponse({
          source: "action_events",
          contractVersion: 2,
          grain: "platform",
          metrics: [
            {
              id: "metric-1",
              contractVersion: 2,
              metricKind: "activity",
              grain: "platform",
              societyId: null,
              targetType: null,
              targetId: null,
              threadId: null,
              periodStart: "2026-09-01T00:00:00.000Z",
              periodEnd: "2026-09-04T00:00:00.000Z",
              snapshotAt: null,
              data: {
                eventCounts: {},
                distinctActors: 12,
                likesAdded: 45,
                likesRemoved: 5,
                dislikesAdded: 2,
                dislikesRemoved: 1,
                reactionScoreDelta: 39,
                joins: 8,
                leaves: 3,
                activations: 4,
                bans: 0,
                activeMembershipDelta: 5,
                firstActivityAt: null,
                lastActivityAt: null,
              },
              refreshRunId: "run-1",
              createdAt: "2026-09-04T00:00:00.000Z",
              updatedAt: "2026-09-04T00:00:00.000Z",
            },
          ],
          page: { cursor: null, hasMore: false },
        });
      }
      return jsonResponse(emptyPage());
    });
    setup();

    // Action totals cards
    expect(await screen.findByLabelText("Explanation for Distinct actors")).toBeInTheDocument();
    expect(screen.getByLabelText("Explanation for Likes added")).toBeInTheDocument();
    expect(screen.getByLabelText("Explanation for Likes removed")).toBeInTheDocument();
    expect(screen.getByLabelText("Explanation for Dislikes added")).toBeInTheDocument();
    expect(screen.getByLabelText("Explanation for Dislikes removed")).toBeInTheDocument();
    expect(screen.getByLabelText("Explanation for Reaction score delta")).toBeInTheDocument();
    expect(screen.getByLabelText("Explanation for Joins")).toBeInTheDocument();
    expect(screen.getByLabelText("Explanation for Leaves")).toBeInTheDocument();
    expect(screen.getByLabelText("Explanation for Activations")).toBeInTheDocument();
    expect(screen.getByLabelText("Explanation for Bans")).toBeInTheDocument();

  });

});
