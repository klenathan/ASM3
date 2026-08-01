import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { NotificationsPage } from "./notifications-page";

vi.mock("@/auth/auth-provider", () => ({
  useAuth: () => ({ user: null }),
}));

vi.mock("@/lib/api/queries", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/queries")>();
  return {
    ...actual,
    useNotifications: () => ({
      data: [
        {
          notification_id: "n1",
          recipient_user_id: "u-current",
          type: "REPLY",
          content_id: "p-1",
          actor_user_id: "u-other",
          read: false,
          created_at: "2026-07-30T10:00:00.000Z",
          institution_id: "rmit",
        },
      ],
      isLoading: false,
    }),
    useMarkNotificationRead: () => ({ mutate: vi.fn() }),
  };
});

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <NotificationsPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("NotificationsPage", () => {
  it("shows a reply notification with an action to view the post", () => {
    renderPage();
    expect(screen.getByText("New reply")).toBeInTheDocument();
    expect(screen.getByText("View the post")).toBeInTheDocument();
  });

  it("shows the unread count", () => {
    renderPage();
    expect(screen.getByText(/1 UNREAD/i)).toBeInTheDocument();
  });
});
