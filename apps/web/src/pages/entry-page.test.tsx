import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { EntryPage } from "./entry-page";

const useSocietiesMock = vi.fn((_enabled: boolean) => ({
  data: undefined,
  isLoading: false,
}));

vi.mock("@/auth/auth-provider", () => ({
  useAuth: () => ({ user: null, token: null }),
}));

vi.mock("@/lib/api/queries", () => ({
  useSocieties: (enabled: boolean) => useSocietiesMock(enabled),
  useJoinSociety: () => ({ mutate: vi.fn() }),
}));

describe("EntryPage", () => {
  it("disables the societies query for signed-out visitors", () => {
    render(
      <MemoryRouter>
        <EntryPage />
      </MemoryRouter>
    );

    expect(useSocietiesMock).toHaveBeenCalledWith(false);
  });
});
