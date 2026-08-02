import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SocietyIndex } from "./society-index";
import type { MySociety } from "./types";

const AVATAR_ID = "00000000-0000-4000-8000-00000000000a";

const societies: MySociety[] = [
  {
    id: "10000000-0000-4000-8000-000000000001",
    slug: "cloud",
    name: "Cloud Computing",
    avatarMediaId: AVATAR_ID,
    membership: { role: "member", status: "active" },
  },
  {
    id: "10000000-0000-4000-8000-000000000002",
    slug: "design",
    name: "Design Guild",
    avatarMediaId: AVATAR_ID,
    membership: { role: "moderator", status: "active" },
  },
];

function client() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function stubFetch(handler: (url: string) => Promise<Response>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/v1/media/")) {
        return jsonResponse({ url: "https://media.example/avatar.png" });
      }
      return handler(url);
    }),
  );
}

function renderIndex(queryClient = client()) {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <SocietyIndex />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SocietyIndex", () => {
  it("lists the user's subscribed societies as links", async () => {
    stubFetch(() => Promise.resolve(jsonResponse(societies)));
    renderIndex();

    expect(await screen.findByRole("link", { name: /open cloud computing/i })).toHaveAttribute(
      "href",
      "/s/cloud",
    );
    expect(screen.getByRole("link", { name: /open design guild/i })).toHaveAttribute(
      "href",
      "/s/design",
    );
    expect(screen.getByText("mod")).toBeInTheDocument();
  });

  it("shows an empty state when the user has no subscriptions", async () => {
    stubFetch(() => Promise.resolve(jsonResponse([])));
    renderIndex();

    expect(
      await screen.findByText(/society shelf is waiting for its first entry/i),
    ).toBeInTheDocument();
  });

  it("shows an error fallback and recovers on retry", async () => {
    let call = 0;
    stubFetch(() =>
      Promise.resolve(
        call++ === 0 ? new Response(null, { status: 500 }) : jsonResponse(societies),
      ),
    );
    const user = userEvent.setup();
    renderIndex();

    expect(
      await screen.findByText(/couldn't load your societies/i),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /retry/i }));

    await waitFor(() =>
      expect(screen.getByRole("link", { name: /open cloud computing/i })).toBeInTheDocument(),
    );
  });
});
