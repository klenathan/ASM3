import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { endpoints } from "@/lib/api/endpoints";

import { AuthProvider } from "./auth-provider";

vi.mock("@/lib/api/endpoints", () => ({
  endpoints: {
    me: { bootstrap: vi.fn() },
  },
}));

describe("AuthProvider", () => {
  it("does not bootstrap a user without an auth token", async () => {
    render(
      <AuthProvider>
        <div>Home</div>
      </AuthProvider>
    );

    await waitFor(() => {
      expect(endpoints.me.bootstrap).not.toHaveBeenCalled();
    });
  });
});
