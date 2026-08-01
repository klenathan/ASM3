import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import type { Post, Society, User } from "@/lib/api/types";

const currentUser: User = {
  entity_type: "USER",
  user_id: "u-current",
  cognito_sub: "sub",
  handle: "ava",
  display_name: "Ava Patel",
  bio: "",
  role: "STUDENT",
  status: "ACTIVE",
  institution_id: "rmit",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

const homeSociety: Society = {
  entity_type: "SOCIETY",
  society_id: "s-home",
  slug: "home",
  name: "RMIT Home",
  description: "Your institution common room",
  rules: "",
  owner_user_id: "u-x",
  institution_id: "rmit",
  member_count: 48210,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

const approvedPost: Post = {
  entity_type: "POST",
  post_id: "p-approved",
  author_user_id: "u-other",
  society_id: "s-home",
  institution_id: "rmit",
  title: "",
  body: "Best silent study spots after 6pm?",
  state: "APPROVED",
  requires_warning: false,
  media_id: null,
  pinned: false,
  locked: false,
  deleted: false,
  removed_by_moderator: false,
  version: 1,
  reply_count: 0,
  vote_count: 47,
  created_at: "2026-07-29T13:20:00.000Z",
  updated_at: "2026-07-29T13:20:00.000Z",
};

const pendingPost: Post = {
  entity_type: "POST",
  post_id: "p-pending",
  author_user_id: "u-current",
  society_id: "s-home",
  institution_id: "rmit",
  title: "",
  body: "studio allocation for next semester",
  state: "PENDING",
  requires_warning: false,
  media_id: null,
  pinned: false,
  locked: false,
  deleted: false,
  removed_by_moderator: false,
  version: 1,
  reply_count: 0,
  vote_count: 0,
  created_at: "2026-07-31T09:00:00.000Z",
  updated_at: "2026-07-31T09:00:00.000Z",
};

vi.mock("@/auth/auth-provider", () => ({
  useAuth: () => ({ user: currentUser }),
}));

vi.mock("@/lib/api/queries", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/queries")>();
  return {
    ...actual,
    useSocieties: () => ({ data: [homeSociety] }),
    useFeed: () => ({
      data: { items: [approvedPost, pendingPost], next_cursor: null },
      isLoading: false,
      isError: false,
    }),
    useCreatePost: () => ({
      mutate: vi.fn(),
      isPending: false,
    }),
  };
});

function renderFeed() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <FeedPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

import { FeedPage } from "./feed-page";

describe("FeedPage moderation behavior", () => {
  it("keeps PENDING posts out of the public Feed region", () => {
    renderFeed();

    const feed = screen.getByTestId("public-feed");
    expect(
      within(feed).queryByText(/studio allocation for next semester/i)
    ).not.toBeInTheDocument();
  });

  it("does not surface server-returned pending content in the public feed", () => {
    renderFeed();

    const feed = screen.getByTestId("public-feed");
    expect(within(feed).getByText(/study spots after 6pm/i)).toBeInTheDocument();
    // Pending content from the server is filtered out of the public feed.
    expect(
      within(feed).queryByText(/studio allocation for next semester/i)
    ).not.toBeInTheDocument();
  });

  it("surfaces approved posts in the public feed", () => {
    renderFeed();

    const feed = screen.getByTestId("public-feed");
    expect(
      within(feed).getByText(/study spots after 6pm/i)
    ).toBeInTheDocument();
  });
});
