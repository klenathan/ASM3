import { MessageSquare, ThumbsUp } from "lucide-react";
import { Link } from "react-router-dom";

import { Spinner } from "../../components/ui/spinner";
import type { UserCommentActivity, UserThreadActivity } from "./types";

function timeAgo(value: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000))
  if (seconds < 60) return "just now"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

export function ActivityFeed({
  threads,
  comments,
  loading,
  error,
  threadsEmptyLabel,
  commentsEmptyLabel,
}: {
  threads: UserThreadActivity[]
  comments: UserCommentActivity[]
  loading: boolean
  error: string | null
  threadsEmptyLabel: string
  commentsEmptyLabel: string
}) {
  if (loading) {
    return (
      <div className="flex justify-center py-14 text-muted-foreground">
        <Spinner className="size-6" />
      </div>
    )
  }

  if (error !== null) {
    return <p className="py-10 text-center text-muted-foreground">{error}</p>
  }

  return (
    <div className="flex flex-col gap-14">
      <section aria-labelledby="threads-title">
        <div className="flex items-end justify-between border-b-2 border-foreground pb-4">
          <h2 id="threads-title" className="font-heading text-2xl font-semibold tracking-[0.01em] uppercase">
            Threads
          </h2>
          <span className="text-xs text-muted-foreground">{threads.length}</span>
        </div>

        {threads.length === 0 ? (
          <div className="py-12">
            <h3 className="font-heading text-xl font-semibold tracking-[0.01em] uppercase">
              No threads yet.
            </h3>
            <p className="mt-2 max-w-md leading-7 text-muted-foreground">{threadsEmptyLabel}</p>
          </div>
        ) : (
          <div>
            {threads.map((thread) => (
              <article key={thread.id} className="border-b border-foreground/15 py-5">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <Link
                    to={`/s/${thread.societySlug}`}
                    className="font-semibold text-primary hover:underline"
                  >
                    /{thread.societySlug}
                  </Link>
                  <span aria-hidden="true">·</span>
                  <span>{timeAgo(thread.createdAt)}</span>
                </div>
                <h3 className="mt-2 text-lg leading-7 font-medium text-foreground">
                  {thread.title}
                </h3>
                {thread.body !== null && (
                  <p className="mt-1 line-clamp-2 max-w-2xl leading-7 text-muted-foreground">
                    {thread.body}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <ThumbsUp aria-hidden="true" className="size-3.5" />
                    {thread.score}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <MessageSquare aria-hidden="true" className="size-3.5" />
                    {thread.commentCount}
                  </span>
                  <span>
                    by{" "}
                    <Link to={`/u/${thread.authorId}`} className="font-medium hover:text-primary">
                      {thread.authorDisplayName}
                    </Link>
                  </span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="comments-title">
        <div className="flex items-end justify-between border-b-2 border-foreground pb-4">
          <h2 id="comments-title" className="font-heading text-2xl font-semibold tracking-[0.01em] uppercase">
            Comments
          </h2>
          <span className="text-xs text-muted-foreground">{comments.length}</span>
        </div>

        {comments.length === 0 ? (
          <div className="py-12">
            <h3 className="font-heading text-xl font-semibold tracking-[0.01em] uppercase">
              No comments yet.
            </h3>
            <p className="mt-2 max-w-md leading-7 text-muted-foreground">{commentsEmptyLabel}</p>
          </div>
        ) : (
          <div>
            {comments.map((comment) => (
              <article key={comment.id} className="border-b border-foreground/15 py-5">
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
                    <span className="font-medium text-foreground">{comment.threadTitle}</span>
                  </span>
                  <span>
                    by{" "}
                    <Link to={`/u/${comment.authorId}`} className="font-medium hover:text-primary">
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
  )
}
