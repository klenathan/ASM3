import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProfileHeader, type ProfileHeaderData } from "./profile-header";

const base: ProfileHeaderData = {
  userId: "11111111-1111-4111-8111-111111111111",
  displayName: "Nadia Tran",
  bio: "Building things for the RMIT community.",
  avatarMediaId: null,
  platformRole: "student",
  status: "active",
  isPublic: true,
  createdAt: "2026-02-01T00:00:00.000Z",
};

function renderWithQueries(profile: ProfileHeaderData, owner = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ProfileHeader profile={profile} owner={owner} />
    </QueryClientProvider>,
  );
}

describe("ProfileHeader", () => {
  it("renders name, role badge, and joined date", () => {
    renderWithQueries(base);
    expect(screen.getByRole("heading", { name: /nadia tran/i })).toBeInTheDocument();
    expect(screen.getByText("Member")).toBeInTheDocument();
    expect(screen.getByText(/joined/i)).toBeInTheDocument();
  });

  it("shows a Private badge only when the owner is viewing a private profile", () => {
    const { rerender } = renderWithQueries({ ...base, isPublic: false }, true);
    expect(screen.getByText("Private")).toBeInTheDocument();

    rerender(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ProfileHeader profile={{ ...base, isPublic: false }} owner={false} />
      </QueryClientProvider>,
    );
    expect(screen.queryByText("Private")).not.toBeInTheDocument();
  });

  it("renders the system admin role badge", () => {
    renderWithQueries({ ...base, platformRole: "system_admin" });
    expect(screen.getByText("System admin")).toBeInTheDocument();
  });
});
