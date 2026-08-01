import { ArrowUp, Flag, MessageCircle } from "lucide-react";
import { useState } from "react";

import type { ContentState, Post } from "@/lib/api/types";
import { STATE_LABEL, timeAgo, type Member, type SpaceView } from "@/lib/model";
import { cn } from "@/lib/utils";

import { MemberAvatar, RoleBadge } from "./member-bits";
import { Button } from "./ui/button";

function fallbackMember(post: Post): Member {
  const id = post.author_user_id;
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return {
    id,
    name: "Member",
    handle: id,
    initials: (id[0] ?? "?").toUpperCase(),
    avatarHue: hash % 360,
    role: "STUDENT",
    school: "",
    bio: "",
  };
}

function StateStamp({ state }: { state: ContentState }) {
  if (state === "APPROVED") return null;
  const label = STATE_LABEL[state].abbreviated;
  if (state === "REJECTED" || state === "FAILED") {
    return (
      <span className="inline-flex items-center gap-1 rounded border border-destructive/40 bg-destructive/10 px-1.5 py-px text-[0.65rem] font-bold tracking-wider text-destructive uppercase">
        <Flag className="size-3" />
        {label}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded border border-accent/40 bg-accent/20 px-1.5 py-px text-[0.65rem] font-bold tracking-wider text-accent-foreground uppercase">
      <span className="size-1.5 animate-pulse rounded-full bg-current" />
      {label}
    </span>
  );
}

export function UpvoteButton({ initial }: { initial: number }) {
  const [count, setCount] = useState(initial);
  const [active, setActive] = useState(false);
  return (
    <Button
      variant={active ? "default" : "outline"}
      size="sm"
      aria-pressed={active}
      aria-label={active ? "Remove upvote" : "Upvote"}
      onClick={() => {
        setCount((c) => c + (active ? -1 : 1));
        setActive((a) => !a);
      }}
      className="h-7 rounded-[10px] px-2"
    >
      <ArrowUp className="size-3.5" />
      <span className="tabular-nums font-semibold">{count}</span>
    </Button>
  );
}

export function PostCard({
  post,
  onOpen,
  compact = false,
  author,
  space,
}: {
  post: Post;
  onOpen?: (id: string) => void;
  compact?: boolean;
  author?: Member;
  space?: SpaceView;
}) {
  const resolvedAuthor = author ?? fallbackMember(post);
  const wrap = onOpen ? "cursor-pointer" : "";
  const sp = space ?? {
    id: post.society_id,
    slug: "",
    name: "Space",
    description: "",
    tagline: "",
    members: 0,
    curie: "SPACE",
    hue: resolvedAuthor.avatarHue,
  };

  return (
    <article
      onClick={onOpen ? () => onOpen(post.post_id) : undefined}
      className={cn(
        "group relative border border-border bg-card text-card-foreground transition-all",
        "rounded-md shadow-[0_1px_2px_rgba(0,0,0,0.06),0_10px_28px_-18px_rgba(0,0,0,0.28)]",
        "dark:shadow-[0_1px_0_rgba(255,255,255,0.05)]",
        wrap
      )}
    >
      <div className="flex flex-col overflow-hidden md:flex-row">
        <div
          className="relative shrink-0 overflow-hidden border-b border-border md:w-2 md:border-0 md:border-r"
          style={{ background: `oklch(0.6 0.15 ${sp.hue})` }}
        >
          <span className="sr-only">{sp.name}</span>
        </div>

        <div className="min-w-0 flex-1 p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <MemberAvatar member={resolvedAuthor} size="md" />
            <div className="min-w-0 flex-1 leading-tight">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-semibold">
                  {resolvedAuthor.name}
                </span>
                <RoleBadge role={resolvedAuthor.role} />
              </div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                <span>@{resolvedAuthor.handle}</span>
                <span aria-hidden>·</span>
                <span className="font-medium text-foreground">{sp.name}</span>
                <span aria-hidden>·</span>
                <span>{timeAgo(post.created_at)}</span>
              </div>
            </div>
            <StateStamp state={post.state} />
          </div>

          <div className="mt-3">
            {post.title && (
              <h3 className="font-display text-lg font-bold leading-snug tracking-tight">
                {post.title}
              </h3>
            )}
            <p
              className={cn(
                "text-[0.9375rem] leading-relaxed text-foreground/90",
                compact && "line-clamp-3"
              )}
            >
              {post.body}
            </p>
          </div>

          <div className="mt-4 flex items-center gap-2 border-t border-border/70 pt-3">
            <UpvoteButton initial={post.vote_count} />
            <Button
              variant="ghost"
              size="sm"
              className="h-7 rounded-[10px] px-2 text-muted-foreground"
              aria-label={`${post.reply_count} replies`}
            >
              <MessageCircle className="size-3.5" />
              <span className="tabular-nums">{post.reply_count}</span>
              <span className="hidden sm:inline">replies</span>
            </Button>
          </div>
        </div>
      </div>
    </article>
  );
}
