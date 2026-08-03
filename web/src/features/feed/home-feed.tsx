import { RefreshCw } from "lucide-react";
import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
} from "../../components/ui/card";
import { Skeleton } from "../../components/ui/skeleton";
import { Spinner } from "../../components/ui/spinner";
import { DiscussionCard } from "../discussions/thread-card";
import type { DiscussionItem } from "../discussions/types";
import { useThreadVote } from "../discussions/use-thread-vote";
import { useHomeFeed } from "./use-home-feed";
import type { HomeFeedThread } from "./types";

function toDiscussionItem(thread: HomeFeedThread): DiscussionItem {
  return {
    id: thread.id,
    title: thread.title,
    body: thread.body,
    score: thread.score,
    commentCount: thread.commentCount,
    createdAt: thread.createdAt,
    authorId: thread.authorId,
    authorDisplayName: thread.authorDisplayName,
    societySlug: thread.societySlug,
    societyName: thread.societyName,
    myVote: thread.myVote,
    mediaIds: thread.mediaIds,
  }
}

function FeedSkeleton() {
  return (
    <div aria-label="Loading your feed" className="space-y-4">
      {[0, 1, 2].map((item) => (
        <Card key={item} className="gap-3">
          <CardContent className="space-y-3">
            <Skeleton className="h-3 w-48" />
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

export function HomeFeed() {
  const navigate = useNavigate();
  const query = useHomeFeed();
  const vote = useThreadVote();
  const threads = query.data?.pages.flatMap((page) => page.items) ?? [];
  const { hasNextPage, fetchNextPage } = query;
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = sentinelRef.current;
    if (node === null || !hasNextPage) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void fetchNextPage();
      },
      { rootMargin: "400px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, fetchNextPage]);

  if (query.status === "pending") {
    return (
      <div className="py-10">
        <FeedSkeleton />
      </div>
    );
  }

  if (query.status === "error") {
    return (
      <div className="py-14">
        <p className="max-w-md leading-7 text-muted-foreground">
          {query.error?.message ?? "Your feed couldn't be loaded right now."}
        </p>
        <Button
          type="button"
          variant="outline"
          onClick={() => void query.refetch()}
          className="mt-5 h-10 rounded-none border-foreground/20 px-4 shadow-none"
        >
          <RefreshCw aria-hidden="true" /> Try again
        </Button>
      </div>
    );
  }

  if (threads.length === 0) {
    return (
      <div className="py-14">
        <h3 className="font-heading text-xl font-semibold tracking-[0.01em] uppercase">
          Make the first mark.
        </h3>
        <p className="mt-3 max-w-md leading-7 text-muted-foreground">
          Threads from societies you join will collect here. Start by finding a
          community that feels like yours.
        </p>
        <Button
          type="button"
          size="lg"
          onClick={() => navigate("/societies")}
          className="mt-6 h-12 rounded-none px-5 text-base font-semibold shadow-none"
        >
          Browse societies
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {threads.map((thread) => (
        <DiscussionCard
          key={thread.id}
          item={toDiscussionItem(thread)}
          onToggleLike={() =>
            void vote.mutate({
              threadId: thread.id,
              value: thread.myVote === 1 ? 0 : 1,
            })
          }
        />
      ))}
      {query.isFetchingNextPage && (
        <div className="flex justify-center py-8 text-muted-foreground">
          <Spinner />
        </div>
      )}
      <div ref={sentinelRef} aria-hidden="true" className="h-px" />
    </div>
  );
}
