import { ThumbsUp } from "lucide-react";
import { Link } from "react-router-dom";

import { Spinner } from "../../components/ui/spinner";
import { DiscussionCard } from "../discussions/thread-card";
import type { DiscussionItem } from "../discussions/types";
import { useThreadVote } from "../discussions/use-thread-vote";
import type { UserCommentActivity, UserThreadActivity } from "./types";

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

export function ActivityFeed({
  threads,
  comments,
  loading,
  error,
  threadsEmptyLabel,
  commentsEmptyLabel,
}: {
  threads: UserThreadActivity[];
  comments: UserCommentActivity[];
  loading: boolean;
  error: string | null;
  threadsEmptyLabel: string;
  commentsEmptyLabel: string;
}) {
  const vote = useThreadVote();

  if (loading) {
    return (
      <div className="flex justify-center py-14 text-muted-foreground">
        <Spinner className="size-6" />
      </div>
    );
  }

  if (error !== null) {
    return <p className="py-10 text-center text-muted-foreground">{error}</p>;
  }

  return (
    <div className="flex flex-col gap-14">
      <section aria-labelledby="threads-title" className="flex flex-col gap-4">
        <div className="flex items-end justify-between border-b-2 border-foreground pb-4">
          <h2
            id="threads-title"
            className="font-heading text-2xl font-semibold tracking-[0.01em] uppercase"
          >
            Threads
          </h2>
          <span className="text-xs text-muted-foreground">
            {threads.length}
          </span>
        </div>

        {threads.length === 0 ? (
          <div className="py-12">
            <h3 className="font-heading text-lg tracking-[0.01em] uppercase">
              No threads yet.
            </h3>
            <p className="mt-2 max-w-md leading-7 text-muted-foreground">
              {threadsEmptyLabel}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {threads.map((thread) => {
              const item: DiscussionItem = {
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
              };
              return (
                <DiscussionCard
                  key={thread.id}
                  item={item}
                  onToggleLike={() =>
                    void vote.mutate({ threadId: thread.id, value: 1 })
                  }
                />
              );
            })}
          </div>
        )}
      </section>

      <section aria-labelledby="comments-title">
        <div className="flex items-end justify-between border-b-2 border-foreground pb-4">
          <h2
            id="comments-title"
            className="font-heading text-2xl font-semibold tracking-[0.01em] uppercase"
          >
            Comments
          </h2>
          <span className="text-xs text-muted-foreground">
            {comments.length}
          </span>
        </div>

        {comments.length === 0 ? (
          <div className="py-12">
            <h3 className="font-heading text-lg tracking-[0.01em] uppercase">
              No comments yet.
            </h3>
            <p className="mt-2 max-w-md leading-7 text-muted-foreground">
              {commentsEmptyLabel}
            </p>
          </div>
        ) : (
          <div>
            {comments.map((comment) => (
              <article
                key={comment.id}
                className="border-b border-foreground/15 py-5"
              >
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <Link
                    to={`/s/${comment.societySlug}`}
                    className="font-semibold text-primary hover:underline"
                  >
                    /{comment.societySlug}
                  </Link>
                  <span aria-hidden="true">·</span>
                  <span>{timeAgo(comment.createdAt)}</span>
                </div>
                <p className="mt-2 line-clamp-2 max-w-2xl leading-7 text-muted-foreground">
                  {comment.body}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <ThumbsUp aria-hidden="true" className="size-3.5" />
                    {comment.score}
                  </span>
                  <span>
                    on{" "}
                    <span className="font-medium text-foreground">
                      {comment.threadTitle}
                    </span>
                  </span>
                  <span>
                    by{" "}
                    <Link
                      to={`/u/${comment.authorId}`}
                      className="font-medium hover:text-primary"
                    >
                      {comment.authorDisplayName}
                    </Link>
                  </span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
