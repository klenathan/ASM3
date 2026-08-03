import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthorLink } from "./author-link";

const AUTHOR_ID = "55555555-5555-4555-8555-555555555555";

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
        return jsonResponse({ mediaId: "m", url: "https://media.example/author.png" });
      }
      return handler(url);
    }),
  );
}

function profile(overrides: Record<string, unknown> = {}) {
  return jsonResponse({
    userId: AUTHOR_ID,
    displayName: "Nadia Tran",
    bio: null,
    avatarMediaId: null,
    platformRole: "student",
    status: "active",
    isPublic: true,
    isOwner: false,
    createdAt: "2026-02-01T00:00:00.000Z",
    ...overrides,
  });
}

function renderAuthorLink(authorId = AUTHOR_ID) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <AuthorLink authorId={authorId} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AuthorLink", () => {
  it("renders a u/name link to the author's public profile", async () => {
    stubFetch(() => Promise.resolve(profile()));
    renderAuthorLink();

    const link = await screen.findByRole("link", { name: /u\/nadia tran/i });
    expect(link).toHaveAttribute("href", `/u/${AUTHOR_ID}`);
  });

  it("shows initials fallback and still links when the author has an avatar", async () => {
    stubFetch(() =>
      Promise.resolve(profile({ avatarMediaId: "00000000-0000-4000-8000-00000000000a" })),
    );
    renderAuthorLink();

    await screen.findByRole("link", { name: /u\/nadia tran/i });
    expect(screen.getByText("NT")).toBeInTheDocument();
  });

  it("shows [deleted] when the profile cannot be fetched", async () => {
    stubFetch(() => Promise.resolve(new Response(null, { status: 404 })));
    renderAuthorLink();

    expect(await screen.findByText("[deleted]")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
