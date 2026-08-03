import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useMediaUrl } from "../../features/media/use-media-url";
import { AuthProvider } from "../../features/auth/auth-context";
import { TopBar } from "./TopBar";

vi.mock("../../features/media/use-media-url", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../features/media/use-media-url")>();
  return {
    ...actual,
    useMediaUrl: vi.fn(actual.useMediaUrl),
  };
});
const mockedUseMediaUrl = vi.mocked(useMediaUrl);

const currentUser = {
  userId: "11111111-1111-4111-8111-111111111111",
  email: "student@rmit.edu.au",
  displayName: "New Student",
  bio: null,
  avatarMediaId: null as string | null,
  platformRole: "student" as const,
  status: "active" as const,
  suspendedUntil: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function setup(overrides: Partial<typeof currentUser> = {}) {
  const user = { ...currentUser, ...overrides };
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify(user), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ),
  );
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AuthProvider>
        <MemoryRouter>
          <TopBar />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("TopBar", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("restores a cookie session even when local storage has been cleared", async () => {
    setup();
    expect(await screen.findByLabelText(/search societies/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /rmit society/i })).toBeInTheDocument();
    expect(screen.getByText("New Student")).toBeInTheDocument();
  });

  it("opens the account menu with sign out", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(await screen.findByText("New Student"));
    expect(await screen.findByRole("menuitem", { name: /sign out/i })).toBeInTheDocument();
  });

  it("resolves the avatar media url when the user has one", async () => {
    mockedUseMediaUrl.mockClear();
    setup({ avatarMediaId: "11111111-1111-4111-8111-222222222222" });
    await screen.findByLabelText(/search societies/i);
    expect(mockedUseMediaUrl).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-222222222222",
    );
  });

  it("does not resolve a media url when the user has no avatar", async () => {
    mockedUseMediaUrl.mockClear();
    setup({ avatarMediaId: null });
    await screen.findByLabelText(/search societies/i);
    expect(mockedUseMediaUrl).toHaveBeenCalledWith(null);
  });
});
