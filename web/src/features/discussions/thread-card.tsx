import { ArrowBigUp, MessageCircle, Share2 } from "lucide-react";
import { Link } from "react-router-dom";

import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { cn } from "../../lib/utils";
import { timeAgo } from "./use-thread-vote";
import type { DiscussionItem } from "./types";

export function DiscussionCard({
  item,
  onToggleLike,
  showSociety = true,
}: {
  readonly item: DiscussionItem
  readonly onToggleLike?: () => void
  readonly showSociety?: boolean
}) {
  const liked = item.myVote === 1;
  const author =
    item.authorDisplayName === null ? null : (
      <Link to={`/u/${item.authorId}`} className="font-medium hover:text-primary">
        u/{item.authorDisplayName}
      </Link>
    );

  return (
    <Card>
      <CardHeader className="gap-1.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {showSociety && item.societySlug !== null && (
            <>
              <Link
                to={`/s/${item.societySlug}`}
                className="font-semibold text-foreground hover:text-primary"
              >
                r/{item.societyName}
              </Link>
              <span aria-hidden="true">·</span>
            </>
          )}
          <span>
            Posted by {author ?? <span className="text-muted-foreground/70">[deleted]</span>}
          </span>
          <span aria-hidden="true">·</span>
          <span>{timeAgo(item.createdAt)}</span>
        </div>
      </CardHeader>

      <CardContent className="space-y-2">
        <CardTitle className="text-lg font-semibold leading-snug">
          {item.title}
        </CardTitle>
        {item.body !== null && (
          <p className="line-clamp-3 leading-7 text-muted-foreground">{item.body}</p>
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
            onClick={onToggleLike}
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
        <span className="inline-flex items-center gap-1">
          <MessageCircle aria-hidden="true" className="size-4" strokeWidth={2} />
          {item.commentCount} comment{item.commentCount === 1 ? "" : "s"}
        </span>
        <span className="inline-flex items-center gap-1">
          <Share2 aria-hidden="true" className="size-4" strokeWidth={2} />
        </span>
      </CardFooter>
    </Card>
  );
}
