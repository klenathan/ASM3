import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "../../features/auth/auth-context";
import { SignInPage } from "./SignInPage";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function renderSignIn() {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={["/sign-in"]}>
        <Routes>
          <Route path="/sign-in" element={<SignInPage />} />
          <Route path="/" element={<div>Home marker</div>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

describe("SignInPage", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the suspension end date when signing into a suspended account", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith("/auth/me")) {
        return Promise.resolve(jsonResponse({ error: { code: "AUTH_REQUIRED" } }, 401));
      }
      return Promise.resolve(
        jsonResponse(
          {
            error: {
              code: "USER_SUSPENDED",
              message: "This account is suspended",
              details: { suspendedUntil: "2026-03-01T00:00:00.000Z" },
            },
          },
          403,
        ),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    renderSignIn();

    await user.type(screen.getByLabelText(/rmit email/i), "suspended@rmit.edu.au");
    await user.type(screen.getByLabelText(/^password/i), "password123");
    await user.click(screen.getByRole("button", { name: /enter the forum/i }));

    await waitFor(() =>
      expect(screen.getByText(/suspended until/i)).toBeInTheDocument(),
    );
  });

  it("reports an indefinite suspension when no end date is provided", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith("/auth/me")) {
        return Promise.resolve(jsonResponse({ error: { code: "AUTH_REQUIRED" } }, 401));
      }
      return Promise.resolve(
        jsonResponse(
          {
            error: {
              code: "USER_SUSPENDED",
              message: "This account is suspended",
              details: { suspendedUntil: null },
            },
          },
          403,
        ),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    renderSignIn();

    await user.type(screen.getByLabelText(/rmit email/i), "suspended@rmit.edu.au");
    await user.type(screen.getByLabelText(/^password/i), "password123");
    await user.click(screen.getByRole("button", { name: /enter the forum/i }));

    await waitFor(() =>
      expect(screen.getByText(/no set end date/i)).toBeInTheDocument(),
    );
  });
});
