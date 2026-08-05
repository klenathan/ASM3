import { ArrowBigUp, MessageCircle, Share2 } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import { cn } from "../../lib/utils";
import { ThreadMedia } from "../media/thread-media";
import { timeAgo } from "./use-thread-vote";
import { AnalysisBadge } from "./analysis-badge";
import type { DiscussionItem } from "./types";

export function DiscussionCard({
  item,
  onToggleLike,
  showSociety = true,
}: {
  readonly item: DiscussionItem;
  readonly onToggleLike?: () => void;
  readonly showSociety?: boolean;
}) {
  const navigate = useNavigate();
  const liked = item.myVote === 1;
  const threadUrl =
    item.societySlug === null ? null : `/s/${item.societySlug}/t/${item.id}`;
  const openThread = () => {
    if (threadUrl !== null) navigate(threadUrl);
  };
  const author =
    item.authorDisplayName === null ? null : (
      <Link
        to={`/u/${item.authorId}`}
        onClick={(event) => event.stopPropagation()}
        className="font-medium hover:text-primary"
      >
        {item.authorDisplayName}
      </Link>
    );

  return (
    <div className="flex flex-col gap-3 border-b border-foreground/15 py-5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        {showSociety && item.societySlug !== null && (
          <>
            <Link
              to={`/s/${item.societySlug}`}
              onClick={(event) => event.stopPropagation()}
              className="font-semibold text-foreground hover:text-primary"
            >
              {item.societyName}
            </Link>
            <span aria-hidden="true">·</span>
          </>
        )}
        <span>
          {author ?? (
            <span className="text-muted-foreground/70">[deleted]</span>
          )}
        </span>
        <span aria-hidden="true">·</span>
        <span>{timeAgo(item.createdAt)}</span>
      </div>

      <div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h3 className="font-heading text-lg font-semibold leading-snug">
            {threadUrl === null ? (
              item.title
            ) : (
              <Link
                to={threadUrl}
                className="text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {item.title}
              </Link>
            )}
          </h3>
          <AnalysisBadge decision={item.analysisDecision} />
        </div>
        {item.body !== null && item.body.length > 0 && (
          <p className="mt-2 line-clamp-3 leading-7 text-muted-foreground">
            {item.body}
          </p>
        )}
        {item.mediaIds !== undefined && item.mediaIds.length > 0 && (
          <div className="mt-2">
            <ThreadMedia mediaIds={item.mediaIds} size="md" />
          </div>
        )}
      </div>

      <div className="flex items-center gap-5 text-xs font-medium text-muted-foreground">
        {onToggleLike === undefined ? (
          <span className="inline-flex items-center min-h-11 gap-1.5 px-2 -mx-2">
            <ArrowBigUp aria-hidden="true" className="size-4" strokeWidth={2} />
            {item.score}
          </span>
        ) : (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onToggleLike();
            }}
            aria-pressed={liked}
            aria-label={liked ? "Unlike this thread" : "Like this thread"}
            className={cn(
              "inline-flex min-h-11 items-center gap-1.5 px-2 -mx-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              liked ? "text-primary" : "hover:text-primary",
            )}
          >
            <ArrowBigUp
              aria-hidden="true"
              className="size-4"
              strokeWidth={2}
              fill={liked ? "currentColor" : "none"}
            />
            {item.score}
          </button>
        )}
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            openThread();
          }}
          disabled={threadUrl === null}
          className="inline-flex min-h-11 items-center gap-1.5 px-2 -mx-2 transition-colors hover:text-primary disabled:cursor-default disabled:hover:text-muted-foreground"
        >
          <MessageCircle
            aria-hidden="true"
            className="size-4"
            strokeWidth={2}
          />
          {item.commentCount} comment{item.commentCount === 1 ? "" : "s"}
        </button>
        <span className="inline-flex items-center min-h-11 gap-1.5 px-2 -mx-2">
          <Share2 aria-hidden="true" className="size-4" strokeWidth={2} />
        </span>
      </div>
    </div>
  );
}
