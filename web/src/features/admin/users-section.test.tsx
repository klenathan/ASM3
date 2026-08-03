import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { UsersSection } from "./users-section";
import type { AdminUser } from "./users-api";

vi.mock("../auth/auth-context", () => ({
  useAuth: () => ({
    user: { userId: "self-admin" },
    status: "authenticated",
    error: null,
    signIn: vi.fn(),
    register: vi.fn(),
    signOut: vi.fn(),
    refresh: vi.fn(),
  }),
}));

const users: AdminUser[] = [
  {
    userId: "u-1",
    email: "nadia@student.rmit.edu.au",
    displayName: "Nadia Tran",
    bio: null,
    avatarMediaId: null,
    platformRole: "student",
    status: "active",
    isPublic: true,
    suspendedUntil: null,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
  },
  {
    userId: "u-2",
    email: "bob@rmit.edu.au",
    displayName: "Bob Li",
    bio: null,
    avatarMediaId: null,
    platformRole: "system_admin",
    status: "suspended",
    isPublic: true,
    suspendedUntil: null,
    createdAt: "2026-06-15T00:00:00.000Z",
    updatedAt: "2026-06-15T00:00:00.000Z",
  },
];

function renderSection() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  client.setQueryData(["admin", "users", "", ""], undefined);
  return {
    user: userEvent.setup(),
    ...render(
      <QueryClientProvider client={client}>
        <UsersSection />
      </QueryClientProvider>,
    ),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("UsersSection", () => {
  it("renders the user table with role and status badges", async () => {
    const page = { items: users, nextCursor: null, hasMore: false };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(page), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    renderSection();

    expect(await screen.findByText("Nadia Tran")).toBeInTheDocument();
    expect(screen.getByText("nadia@student.rmit.edu.au")).toBeInTheDocument();
    expect(screen.getByText("Bob Li")).toBeInTheDocument();
    expect(screen.getByText("Member")).toBeInTheDocument();
    expect(screen.getByText("System admin")).toBeInTheDocument();
    expect(screen.getByText("Suspended")).toBeInTheDocument();
  });

  it("shows the destructive error inside the suspend dialog on mutation failure", async () => {
    const page = { items: users, nextCursor: null, hasMore: false };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(page), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValue(
        new Response(
          JSON.stringify({ error: { code: "ADMIN_REQUIRED", message: "Admins only" } }),
          { status: 403, headers: { "Content-Type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const { user } = renderSection();

    await screen.findByText("Nadia Tran");
    await user.click(
      screen.getByRole("button", { name: /actions for nadia tran/i }),
    );
    await user.click(screen.getByRole("menuitem", { name: /suspend/i }));

    await user.click(screen.getByRole("button", { name: /^suspend$/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Admins only");
  });
});
