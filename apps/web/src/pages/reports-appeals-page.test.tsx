import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ReportsAppealsPage } from "./reports-appeals-page";

vi.mock("@/auth/auth-provider", () => ({
  useAuth: () => ({ user: null }),
}));

vi.mock("@/lib/api/queries", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/queries")>();
  return {
    ...actual,
    useReport: () => ({ mutate: vi.fn(), isPending: false }),
    useCreateAppeal: () => ({ mutate: vi.fn(), isPending: false }),
    useAppeals: () => ({ data: [], isLoading: false }),
    useDecideAppeal: () => ({ mutate: vi.fn() }),
  };
});

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ReportsAppealsPage />
    </QueryClientProvider>
  );
}

describe("ReportsAppealsPage (regular user)", () => {
  it("shows the report and appeal forms", () => {
    renderPage();
    expect(screen.getByText("Report a post")).toBeInTheDocument();
    expect(screen.getByText("Appeal a decision")).toBeInTheDocument();
  });

  it("does not show the moderator appeals review for a regular user", () => {
    renderPage();
    expect(screen.queryByText("Open appeals")).not.toBeInTheDocument();
  });
});
