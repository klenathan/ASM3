import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "@/auth/auth-provider";
import type { Post } from "@/lib/api/types";
import { useCreatePost, useFeed, useSocieties } from "@/lib/api/queries";
import { STATE_LABEL, timeAgo, toMember, toSpace } from "@/lib/model";

import { Composer } from "@/components/composer";
import { PostCard } from "@/components/post-card";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";

export function FeedPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const member = user ? toMember(user) : undefined;

  const { data: societies } = useSocieties();
  const feed = useFeed("joined");
  const createPost = useCreatePost();

  const [myPending, setMyPending] = useState<Post[]>([]);

  const feedPosts = (feed.data?.items ?? []).filter((p) =>
    ["APPROVED", "FLAGGED"].includes(p.state)
  );

  const addPost = (body: string, spaceId: string) => {
    const society = (societies ?? []).find((s) => s.society_id === spaceId);
    if (!society) return;
    createPost.mutate(
      { slug: society.slug, payload: { title: "", body } },
      {
        onSuccess: (post) => setMyPending((prev) => [post, ...prev]),
      }
    );
  };

  const spaces = (societies ?? []).map(toSpace);

  if (feed.isLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Spinner className="size-5" />
        <span className="ml-2 text-sm">Loading your feed…</span>
      </div>
    );
  }

  if (feed.isError) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/5 p-8 text-center">
        <p className="font-semibold text-destructive">Couldn’t load your feed</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Check that the API is reachable, then try again.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-black tracking-tight">
          Your feed
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Recent posts from your spaces and the campus common room.
        </p>
      </div>

      {member && (
        <Composer
          spaces={spaces}
          currentMember={member}
          onPost={addPost}
          pending={createPost.isPending}
        />
      )}

      {myPending.length > 0 && (
        <section
          aria-label="Your posts in review"
          data-testid="in-review"
          className="space-y-3"
        >
          <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Your posts in review
          </h2>
          {myPending.map((p) => (
            <MyPendingCard key={p.post_id} post={p} />
          ))}
        </section>
      )}

      <section
        aria-label="Feed"
        data-testid="public-feed"
        className="space-y-4"
      >
        {feedPosts.length === 0 && (
          <div className="rounded-md border border-dashed border-border p-12 text-center text-muted-foreground">
            <p className="font-display text-2xl font-black tracking-tight">
              Quiet so far
            </p>
            <p className="mt-1 text-sm">
              Posts you and your spaces share will appear here.
            </p>
          </div>
        )}
        {feedPosts.map((p) => (
          <PostCard
            key={p.post_id}
            post={p}
            onOpen={(id) => navigate(`/post/${id}`)}
          />
        ))}
      </section>
    </div>
  );
}

function MyPendingCard({ post }: { post: Post }) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-dashed border-border bg-muted/40 p-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">You</span>
          <span aria-hidden>·</span>
          <span>{timeAgo(post.created_at)}</span>
        </div>
        <p className="mt-1 text-sm text-foreground/80">{post.body}</p>
        <div className="mt-2">
          <Badge
            variant="outline"
            className="border-accent/40 bg-accent/20 text-accent-foreground"
          >
            <span className="mr-1 size-1.5 animate-pulse rounded-full bg-current" />
            {STATE_LABEL[post.state].full}
          </Badge>
          <p className="mt-1 text-xs text-muted-foreground">
            It’ll appear in the feed once it’s approved.
          </p>
        </div>
      </div>
    </div>
  );
}
