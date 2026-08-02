import { ArrowBigUp, MessageCircle, RefreshCw, Share2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";

import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Skeleton } from "../../components/ui/skeleton";
import { Spinner } from "../../components/ui/spinner";
import { cn } from "../../lib/utils";
import { useHomeFeed, useThreadLike } from "./use-home-feed";
import type { HomeFeedThread } from "./types";

function timeAgo(value: string): string {
  const seconds = Math.max(
    0,
    Math.floor((Date.now() - new Date(value).getTime()) / 1000),
  );
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function FeedCard({ thread }: { readonly thread: HomeFeedThread }) {
  const like = useThreadLike();
  const liked = thread.myVote === 1;

  const toggleLike = () => {
    void like.mutate({ threadId: thread.id, value: liked ? 0 : 1 });
  };

  return (
    <Card>
      <CardHeader className="gap-1.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <Link
            to={`/s/${thread.societySlug}`}
            className="font-semibold text-foreground hover:text-primary"
          >
            r/{thread.societyName}
          </Link>
          {thread.authorDisplayName !== null && (
            <>
              <span aria-hidden="true">·</span>
              <span>
                Posted by{" "}
                <Link
                  to={`/u/${thread.authorId}`}
                  className="font-medium hover:text-primary"
                >
                  u/{thread.authorDisplayName}
                </Link>
              </span>
            </>
          )}
          <span aria-hidden="true">·</span>
          <span>{timeAgo(thread.createdAt)}</span>
        </div>
      </CardHeader>

      <CardContent className="space-y-2">
        <CardTitle className="text-lg font-semibold leading-snug">
          {thread.title}
        </CardTitle>
        {thread.body !== null && (
          <p className="line-clamp-3 leading-7 text-muted-foreground">
            {thread.body}
          </p>
        )}
      </CardContent>

      <CardFooter className="gap-5 text-xs font-medium text-muted-foreground">
        <button
          type="button"
          onClick={toggleLike}
          aria-pressed={liked}
          aria-label={liked ? "Unlike this thread" : "Like this thread"}
          className={cn(
            "inline-flex items-center gap-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
            liked ? "text-primary" : "hover:text-primary",
          )}
        >
          <ArrowBigUp
            aria-hidden="true"
            className="size-4"
            strokeWidth={2}
            fill={liked ? "currentColor" : "none"}
          />
          {thread.score}
        </button>
        <span className="inline-flex items-center gap-1">
          <MessageCircle aria-hidden="true" className="size-4" strokeWidth={2} />
          {thread.commentCount} comment{thread.commentCount === 1 ? "" : "s"}
        </span>
        <span className="inline-flex items-center gap-1">
          <Share2 aria-hidden="true" className="size-4" strokeWidth={2} />
        </span>
      </CardFooter>
    </Card>
  );
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
  );
}

export function HomeFeed() {
  const navigate = useNavigate();
  const query = useHomeFeed();
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
        <FeedCard key={thread.id} thread={thread} />
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
