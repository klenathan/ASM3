import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import type { User } from "@/lib/api/types";

import { RequireAuth } from "./require-auth";

const authedUser: User = {
  entity_type: "USER",
  user_id: "u-current",
  cognito_sub: "sub",
  handle: "ava",
  display_name: "Ava Patel",
  bio: "",
  major: "Information technology",
  role: "STUDENT",
  status: "ACTIVE",
  institution_id: "rmit",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

const useAuthMock = vi.fn();
vi.mock("@/auth/auth-provider", () => ({
  useAuth: () => useAuthMock(),
}));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<p>Login screen</p>} />
        <Route element={<RequireAuth />}>
          <Route path="/feed" element={<p>Protected feed</p>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

describe("RequireAuth", () => {
  it("shows a checking state while auth is loading", () => {
    useAuthMock.mockReturnValue({
      user: null,
      token: null,
      loading: true,
    });
    renderAt("/feed");
    expect(
      screen.getByLabelText("Checking your session")
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });

  it("redirects to /login when there is no session", () => {
    useAuthMock.mockReturnValue({
      user: null,
      token: null,
      loading: false,
    });
    renderAt("/feed");
    expect(screen.getByText("Login screen")).toBeInTheDocument();
    expect(
      screen.queryByText("Protected feed")
    ).not.toBeInTheDocument();
  });

  it("renders the protected outlet when authenticated", () => {
    useAuthMock.mockReturnValue({
      user: authedUser,
      token: "token",
      loading: false,
    });
    renderAt("/feed");
    expect(screen.getByText("Protected feed")).toBeInTheDocument();
    expect(
      screen.queryByText("Login screen")
    ).not.toBeInTheDocument();
  });
});
