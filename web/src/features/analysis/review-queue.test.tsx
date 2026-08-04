import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ReviewQueue } from "./review-queue";
import type { AnalysisQueueThread } from "./types";

const base: Omit<AnalysisQueueThread, "id" | "title" | "analysisDecision"> = {
  societyId: "20000000-0000-4000-8000-000000000001",
  societySlug: "cloud",
  societyName: "Cloud Computing",
  authorId: "30000000-0000-4000-8000-000000000001",
  body: "Body",
  score: 0,
  commentCount: 2,
  mediaIds: [],
  authorDisplayName: "Alex Student",
  authorAvatarMediaId: null,
  myVote: 0,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
  deletedAt: null,
};

const reviewThread: AnalysisQueueThread = {
  ...base,
  id: "10000000-0000-4000-8000-000000000001",
  title: "Flagged thread",
  analysisDecision: "review",
};

const noneThread: AnalysisQueueThread = {
  ...base,
  id: "10000000-0000-4000-8000-000000000002",
  title: "Pending thread",
  analysisDecision: null,
};

function client() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function renderQueue() {
  return render(
    <QueryClientProvider client={client()}>
      <MemoryRouter>
        <ReviewQueue scope="admin" />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ReviewQueue", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requests the admin global route", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        items: [reviewThread],
        nextCursor: null,
        hasMore: false,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    renderQueue();

    await waitFor(() => {
      expect(screen.getByText("Flagged thread")).toBeTruthy();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/admin/analysis"),
      expect.anything(),
    );
  });

  it("renders the review and none badges", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          items: [reviewThread, noneThread],
          nextCursor: null,
          hasMore: false,
        }),
      ),
    );

    renderQueue();

    await waitFor(() => {
      expect(screen.getByText("Flagged for review")).toBeTruthy();
    });
    expect(screen.getByText("Analysis pending")).toBeTruthy();
  });

  it("refetches filtered to none when the None yet tab is selected", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        items: [reviewThread, noneThread],
        nextCursor: null,
        hasMore: false,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    renderQueue();

    await waitFor(() => {
      expect(screen.getByText("Flagged thread")).toBeTruthy();
    });
    fetchMock.mockClear();

    await userEvent.click(screen.getByRole("tab", { name: "None yet" }));

    await waitFor(() => {
      const called = fetchMock.mock.calls.map((call) => String(call[0]));
      expect(called.some((url) => url.includes("status=none"))).toBe(true);
    });
  });

  it("accepts a thread via the global decision endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        items: [reviewThread],
        nextCursor: null,
        hasMore: false,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    renderQueue();

    await waitFor(() => {
      expect(screen.getByText("Flagged thread")).toBeTruthy();
    });
    fetchMock.mockClear();

    await userEvent.click(screen.getByRole("button", { name: "Accept" }));

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        (call) => String(call[1]?.method).toUpperCase() === "POST",
      );
      expect(postCall).toBeTruthy();
      expect(String(postCall![0])).toContain(
        `/api/v1/admin/analysis/${reviewThread.id}/decision`,
      );
      expect(JSON.parse(String(postCall![1]?.body))).toEqual({
        decision: "accept",
      });
    });
  });

  it("shows an empty state when nothing needs review", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({ items: [], nextCursor: null, hasMore: false }),
      ),
    );

    renderQueue();

    await waitFor(() => {
      expect(screen.getByText("No threads need review right now.")).toBeTruthy();
    });
  });
});
