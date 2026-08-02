import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "../../features/auth/auth-context";
import { TopBar } from "./TopBar";

const currentUser = {
  userId: "11111111-1111-4111-8111-111111111111",
  email: "student@rmit.edu.au",
  displayName: "New Student",
  bio: null,
  avatarMediaId: null,
  platformRole: "student" as const,
  status: "active" as const,
  suspendedUntil: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function setup() {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify(currentUser), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ),
  );
  return render(
    <AuthProvider>
      <MemoryRouter>
        <TopBar />
      </MemoryRouter>
    </AuthProvider>,
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
});
