import { ArrowBigUp, MessageCircle, Share2 } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
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
        u/{item.authorDisplayName}
      </Link>
    );

  return (
    <Card
      role={threadUrl === null ? undefined : "link"}
      tabIndex={threadUrl === null ? undefined : 0}
      onClick={openThread}
      onKeyDown={(event) => {
        if (threadUrl === null || (event.key !== "Enter" && event.key !== " "))
          return;
        event.preventDefault();
        openThread();
      }}
      className={cn(
        "max-w-5xl",
        threadUrl === null
          ? undefined
          : "cursor-pointer transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
      )}
    >
      <CardHeader className="gap-1.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {showSociety && item.societySlug !== null && (
            <>
              <Link
                to={`/s/${item.societySlug}`}
                onClick={(event) => event.stopPropagation()}
                className="font-semibold text-foreground hover:text-primary"
              >
                r/{item.societyName}
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
      </CardHeader>

      <CardContent className="space-y-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <CardTitle className="text-lg font-semibold leading-snug">
            {item.title}
          </CardTitle>
          <AnalysisBadge decision={item.analysisDecision} />
        </div>
        {item.body !== null && item.body.length > 0 && (
          <p className="line-clamp-3 leading-7 text-muted-foreground">
            {item.body}
          </p>
        )}
        {item.mediaIds !== undefined && item.mediaIds.length > 0 && (
          <div>
            <ThreadMedia mediaIds={item.mediaIds} size="md" />
          </div>
        )}
      </CardContent>

      <CardFooter className="gap-5 text-xs font-medium text-muted-foreground">
        {onToggleLike === undefined ? (
          <span className="inline-flex items-center gap-1">
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
          className="inline-flex items-center gap-1 hover:text-primary disabled:cursor-default disabled:hover:text-muted-foreground"
        >
          <MessageCircle
            aria-hidden="true"
            className="size-4"
            strokeWidth={2}
          />
          {item.commentCount} comment{item.commentCount === 1 ? "" : "s"}
        </button>
        <span className="inline-flex items-center gap-1">
          <Share2 aria-hidden="true" className="size-4" strokeWidth={2} />
        </span>
      </CardFooter>
    </Card>
  );
}
