import { ArrowLeft, Check, MessageSquare, ThumbsUp } from "lucide-react";
import { useEffect, useRef } from "react";
import { Link, useParams } from "react-router-dom";

import { Button } from "../../components/ui/button";
import { Spinner } from "../../components/ui/spinner";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "../../components/ui/avatar";
import { useAuth } from "../../features/auth/auth-context";
import { useMediaUrl } from "../../features/media/use-media-url";
import {
  SocietyThreadComposer,
  type ThreadPostingAccess,
} from "../../features/societies/society-thread-composer";
import {
  useCreateSocietyThread,
  useJoinSociety,
  useLeaveSociety,
  useSociety,
  useSocietyMembership,
  useSocietyThreads,
} from "../../features/societies/use-society";

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

export function SocietyDetailPage() {
  const { slug = "" } = useParams();
  const { user } = useAuth();
  const societyQuery = useSociety(slug);
  const membershipQuery = useSocietyMembership(slug);
  const threadsQuery = useSocietyThreads(slug);
  const join = useJoinSociety(slug);
  const leave = useLeaveSociety(slug);
  const createThread = useCreateSocietyThread(slug);
  const avatarUrl = useMediaUrl(societyQuery.data?.avatarMediaId);

  const society = societyQuery.data;
  const membership = membershipQuery.data;
  const isMember = membership?.status === "active";
  const isBanned = membership?.status === "banned";
  const postingAccess: ThreadPostingAccess =
    membershipQuery.status === "pending"
      ? "loading"
      : isMember
        ? "member"
        : isBanned
          ? "banned"
          : "guest";

  const { hasNextPage: threadsHasNext, fetchNextPage: threadsFetchNext } =
    threadsQuery;
  const threadsSentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = threadsSentinelRef.current;
    if (node === null) return;
    if (!threadsHasNext) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void threadsFetchNext();
      },
      { rootMargin: "400px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [threadsHasNext, threadsFetchNext]);

  if (societyQuery.status === "pending") {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground">
        <Spinner />
      </div>
    );
  }

  if (societyQuery.status === "error" || society === undefined) {
    return (
      <div className="mx-auto flex flex-1 flex-col items-center justify-center px-6 text-center">
        <p className="text-muted-foreground">
          {societyQuery.error?.message ??
            "This society page could not be found."}
        </p>
        <Button
          type="button"
          variant="outline"
          className="mt-6 h-11 rounded-none border-foreground/20 px-4 shadow-none"
          asChild
        >
          <Link to="/societies">
            <ArrowLeft aria-hidden="true" /> Back to the shelf
          </Link>
        </Button>
      </div>
    );
  }

  const threads = threadsQuery.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="mx-auto w-full max-w-4xl flex-1 px-6 py-12 sm:py-16 lg:px-10">
      <Link
        to="/societies"
        className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
      >
        <ArrowLeft aria-hidden="true" className="size-4" /> All societies
      </Link>

      <section
        aria-labelledby="society-title"
        className="mt-8 border-t-2 border-foreground pt-8"
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-5">
            <a
              href={avatarUrl.data?.url}
              className="shrink-0"
              aria-label={`${society.name} profile picture`}
            >
              <Avatar className="!size-20">
                {avatarUrl.data ? (
                  <AvatarImage
                    src={avatarUrl.data.url}
                    alt={`${society.name} profile picture`}
                    className="rounded-md"
                  />
                ) : null}
                <AvatarFallback className="text-lg">
                  {society.slug.toUpperCase().slice(0, 2)}
                </AvatarFallback>
              </Avatar>
            </a>
            <div className="min-w-0">
              <span className="text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase">
                /{society.slug}
              </span>
              <h1
                id="society-title"
                className="font-heading text-[clamp(2.25rem,4.5vw,3.5rem)] leading-none font-semibold tracking-[-0.01em] uppercase"
              >
                {society.name}
              </h1>
            </div>
          </div>
          <p className="max-w-2xl text-lg leading-8 text-muted-foreground">
            {society.description}
          </p>
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-4 border-t border-foreground/15 pt-6">
          {isMember && (
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-primary">
              <Check aria-hidden="true" className="size-4" strokeWidth={2.5} />
              {membership?.role === "moderator"
                ? "You help run this table"
                : "You sit at this table"}
            </span>
          )}
          {isBanned && (
            <span className="text-sm font-medium text-muted-foreground">
              You can’t join this table right now.
            </span>
          )}

          <div className="ml-auto">
            {!isBanned && (
              <Button
                type="button"
                size="lg"
                disabled={join.isPending || leave.isPending}
                onClick={() => {
                  if (isMember) void leave.mutateAsync();
                  else void join.mutateAsync();
                }}
                className="h-12 rounded-none px-5 text-base font-semibold shadow-none"
              >
                {isMember ? "Leave society" : "Join this society"}
              </Button>
            )}
          </div>
        </div>

        {(join.isError || leave.isError) && (
          <p role="alert" className="mt-4 text-sm text-destructive">
            {join.error?.message ?? leave.error?.message}
          </p>
        )}
      </section>

      <section aria-label="Create a thread" className="mt-14">
        <SocietyThreadComposer
          societyName={society.name}
          displayName={user?.displayName ?? "RMIT student"}
          access={postingAccess}
          isSubmitting={createThread.isPending}
          serverError={createThread.error?.message}
          onCreate={async (input) => {
            createThread.reset();
            await createThread.mutateAsync(input);
          }}
        />
      </section>

      <section aria-labelledby="threads-title" className="mt-10">
        <div className="flex items-end justify-between border-b-2 border-foreground pb-4">
          <h2
            id="threads-title"
            className="font-heading text-2xl font-semibold tracking-[0.01em] uppercase"
          >
            The latest marks
          </h2>
          <span className="text-xs text-muted-foreground">
            {threads.length > 0
              ? `${threads.length} thread${threads.length === 1 ? "" : "s"}`
              : "No threads yet"}
          </span>
        </div>

        {threadsQuery.status === "pending" ? (
          <div className="py-10 text-center text-muted-foreground">
            <Spinner />
          </div>
        ) : threadsQuery.status === "error" ? (
          <p className="py-10 text-center text-muted-foreground">
            {threadsQuery.error?.message}
          </p>
        ) : threads.length === 0 ? (
          <div className="py-14">
            <h3 className="font-heading text-xl font-semibold tracking-[0.01em] uppercase">
              No one has written yet.
            </h3>
            <p className="mt-3 max-w-md leading-7 text-muted-foreground">
              {isMember
                ? "Be the first to post a thread for this table."
                : "Join this society to open the discussion."}
            </p>
          </div>
        ) : (
          <div>
            {threads.map((thread) => (
              <article
                key={thread.id}
                className="group border-b border-foreground/15 py-5"
              >
                <h3 className="text-lg leading-7 font-medium text-foreground">
                  {thread.title}
                </h3>
                {thread.body !== null && (
                  <p className="mt-2 line-clamp-2 max-w-2xl leading-7 text-muted-foreground">
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
                  <span>{timeAgo(thread.createdAt)}</span>
                  {thread.authorDisplayName !== null && (
                    <span>
                      by{" "}
                      <Link
                        to={`/u/${thread.authorId}`}
                        className="font-medium hover:text-primary"
                      >
                        {thread.authorDisplayName}
                      </Link>
                    </span>
                  )}
                </div>
              </article>
            ))}
            {threadsQuery.isFetchingNextPage && (
              <div className="flex justify-center py-8 text-muted-foreground">
                <Spinner />
              </div>
            )}
            <div ref={threadsSentinelRef} aria-hidden="true" className="h-px" />
          </div>
        )}
      </section>
    </div>
  );
}
