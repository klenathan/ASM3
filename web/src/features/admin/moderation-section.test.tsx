import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ModerationSection } from "./moderation-section";
import type { Report } from "./moderation-api";

const report: Report = {
  id: "11111111-1111-4111-8111-111111111111",
  societyId: "22222222-2222-4222-8222-222222222222",
  reporterId: "33333333-3333-4333-8333-333333333333",
  threadId: "44444444-4444-4444-8444-444444444444",
  commentId: null,
  targetType: "thread",
  targetId: "44444444-4444-4444-8444-444444444444",
  reason: "Promotional spam",
  details: "Repeated adverts posted in the study lounge.",
  status: "pending",
  assignedTo: null,
  resolution: null,
  resolutionNote: null,
  createdAt: "2026-08-02T00:00:00.000Z",
  updatedAt: "2026-08-02T00:00:00.000Z",
  resolvedAt: null,
  resolvedBy: null,
};

function mockFetch(resolveError = false) {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/admin/reports")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({ items: [report], nextCursor: null, hasMore: false }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    }
    if (resolveError && url.includes("/resolve")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            error: { code: "ADMIN_REQUIRED", message: "Admins only." },
          }),
          { status: 403, headers: { "Content-Type": "application/json" } },
        ),
      );
    }
    return Promise.resolve(
      new Response(JSON.stringify(report), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const user = userEvent.setup();
  render(
    <QueryClientProvider client={client}>
      <ModerationSection />
    </QueryClientProvider>,
  );
  return { user };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ModerationSection", () => {
  it("renders the global report queue with a report row", async () => {
    mockFetch();
    setup();

    expect(
      await screen.findByText("Promotional spam"),
    ).toBeInTheDocument();
    expect(screen.getByText(/Thread ·/)).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Report actions" })).toBeInTheDocument();
  });

  it("opens the resolve dialog and renders a destructive error on failure", async () => {
    mockFetch(true);
    const { user } = setup();

    expect(await screen.findByText("Promotional spam")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Report actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Resolve" }));

    expect(
      await screen.findByRole("dialog", { hidden: true }),
    ).toBeInTheDocument();
    expect(screen.getByText("Resolve report")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Resolve" }));

    expect(
      await screen.findByText(/admins only/i, { selector: '[role="alert"]' }),
    ).toBeInTheDocument();
  });
});
