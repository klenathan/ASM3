import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuditSection } from "./audit-section";
import type { AuditEvent } from "./audit-api";

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

function mockFetch(items: AuditEvent[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ items, nextCursor: null, hasMore: false }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    ),
  );
}

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <AuditSection />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AuditSection", () => {
  it("renders an empty trail message when there are no events", async () => {
    mockFetch([]);
    setup();

    expect(
      await screen.findByText(/No events recorded yet/i),
    ).toBeInTheDocument();
  });

  it("renders recorded audit events with a humanized label", async () => {
    mockFetch([event]);
    setup();

    expect(await screen.findByText("Thread created")).toBeInTheDocument();
    expect(screen.getByText("Welcome thread")).toBeInTheDocument();
  });
});
