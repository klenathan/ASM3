import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "../../features/auth/auth-context";
import { RegisterPage } from "./RegisterPage";

const currentUser = {
  userId: "11111111-1111-4111-8111-111111111111",
  email: "student@rmit.edu.au",
  displayName: "New Student",
  bio: null,
  avatarMediaId: null,
  platformRole: "student",
  status: "active",
  suspendedUntil: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function renderRegister() {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={["/register"]}>
        <Routes>
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/" element={<div>Home marker</div>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

describe("RegisterPage", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows inline validation errors for empty and invalid input", async () => {
    const user = userEvent.setup();
    renderRegister();

    await user.click(screen.getByRole("button", { name: /create your account/i }));

    expect(screen.getByText("Enter a display name.")).toBeInTheDocument();
    expect(screen.getByText("Enter your RMIT email.")).toBeInTheDocument();
    expect(screen.getByText("Choose a password.")).toBeInTheDocument();
    expect(screen.getByText("Confirm your password.")).toBeInTheDocument();
  });

  it("rejects an invalid email, short password, and mismatched confirmation", async () => {
    const user = userEvent.setup();
    renderRegister();

    await user.type(screen.getByLabelText(/display name/i), "New Student");
    await user.type(screen.getByLabelText(/rmit email/i), "not-an-email");
    await user.type(screen.getByLabelText(/^password/i), "short");
    await user.type(screen.getByLabelText(/confirm password/i), "different");
    await user.click(screen.getByRole("button", { name: /create your account/i }));

    expect(screen.getByText("Enter a valid email address.")).toBeInTheDocument();
    expect(
      screen.getByText("Password must be at least 8 characters."),
    ).toBeInTheDocument();
    expect(screen.getByText("Passwords do not match.")).toBeInTheDocument();
  });

  it("submits valid data to the register endpoint and enters the forum", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ user: currentUser, sessionToken: "token", expiresAt: "" }, 201),
    );
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    renderRegister();

    await user.type(screen.getByLabelText(/display name/i), "New Student");
    await user.type(screen.getByLabelText(/rmit email/i), "student@rmit.edu.au");
    await user.type(screen.getByLabelText(/^password/i), "password123");
    await user.type(screen.getByLabelText(/confirm password/i), "password123");
    await user.click(screen.getByRole("button", { name: /create your account/i }));

    await waitFor(() =>
      expect(screen.getByText("Home marker")).toBeInTheDocument(),
    );

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/v1/auth/register");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      displayName: "New Student",
      email: "student@rmit.edu.au",
      password: "password123",
    });
  });
});
