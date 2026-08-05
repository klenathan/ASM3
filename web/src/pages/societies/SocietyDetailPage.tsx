import { ArrowLeft, Check } from "lucide-react";
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
import { ReviewQueue } from "../../features/analysis/review-queue";
import { useMediaUrl } from "../../features/media/use-media-url";
import { DiscussionCard } from "../../features/discussions/thread-card";
import type { DiscussionItem } from "../../features/discussions/types";
import { useThreadVote } from "../../features/discussions/use-thread-vote";
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

export function SocietyDetailPage() {
  const { slug = "" } = useParams();
  const { user } = useAuth();
  const societyQuery = useSociety(slug);
  const membershipQuery = useSocietyMembership(slug);
  const threadsQuery = useSocietyThreads(slug);
  const join = useJoinSociety(slug);
  const leave = useLeaveSociety(slug);
  const createThread = useCreateSocietyThread(slug);
  const vote = useThreadVote();
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
    <div className="mx-auto w-full max-w-4xl flex-1 px-6 lg:px-10">
      <section
        aria-labelledby="society-title"
        className="mt-8 border-t-2 border-foreground pt-8"
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col md:flex-row items-start justify-between gap-5 md:items-center">
            <div className="flex flex-row gap-4">
              <Avatar className="!size-20">
                {avatarUrl.data ? (
                  <AvatarImage
                    src={avatarUrl.data.url}
                    alt={`${society.name} profile picture`}
                    className="rounded-full"
                  />
                ) : null}
                <AvatarFallback className="text-lg">
                  {society.slug.toUpperCase().slice(0, 2)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <div className="flex flex-col items-start sm:flex-row sm:items-center gap-1 sm:gap-2">
                  <span className="text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase">
                    /{society.slug}
                  </span>
                  {isMember && (
                    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-primary">
                      <Check
                        aria-hidden="true"
                        className="size-4"
                        strokeWidth={2.5}
                      />
                      {membership?.role === "moderator"
                        ? "You help run this table"
                        : "You sit at this table"}
                    </span>
                  )}
                </div>

                <h1
                  id="society-title"
                  className="font-heading text-[clamp(2rem,4vw,3rem)] leading-none font-semibold tracking-[-0.01em] uppercase"
                >
                  {society.name}
                </h1>
              </div>
            </div>

            {!isBanned && (
              <Button
                type="button"
                size="lg"
                variant={isMember ? "outline" : "default"}
                disabled={join.isPending || leave.isPending}
                onClick={() => {
                  if (isMember) void leave.mutateAsync();
                  else void join.mutateAsync();
                }}
                className="h-12 shrink-0 rounded-none px-5 text-base font-semibold shadow-none"
              >
                {isMember ? "Leave society" : "Join this society"}
              </Button>
            )}
          </div>
          <p className="max-w-2xl text-lg leading-8 text-muted-foreground">
            {society.description}
          </p>
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-4 border-t border-foreground/15 pt-6">
          {isBanned && (
            <span className="text-sm font-medium text-muted-foreground">
              You can’t join this table right now.
            </span>
          )}
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

      <section
        aria-labelledby="threads-title"
        className="flex flex-col mt-10 gap-2"
      >
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
          <div className="flex flex-col gap-4">
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
                societySlug: society.slug,
                societyName: society.name,
                myVote: thread.myVote,
                mediaIds: thread.mediaIds,
                analysisDecision: thread.analysisDecision,
                analysisFailed: thread.analysisFailed,
                analysisOverride: thread.analysisOverride,
              };
              return (
                <DiscussionCard
                  key={thread.id}
                  item={item}
                  showSociety={false}
                  onToggleLike={() =>
                    void vote.mutate({ threadId: thread.id, value: 1 })
                  }
                />
              );
            })}
            {threadsQuery.isFetchingNextPage && (
              <div className="flex justify-center py-8 text-muted-foreground">
                <Spinner />
              </div>
            )}
            <div ref={threadsSentinelRef} aria-hidden="true" className="h-px" />
          </div>
        )}
      </section>

      {membership?.role === "moderator" && (
        <section
          aria-labelledby="content-review-title"
          className="mt-10 border-t-2 border-foreground pt-8"
        >
          <div className="flex flex-col gap-1">
            <h2
              id="content-review-title"
              className="font-heading text-2xl font-semibold tracking-[0.01em] uppercase"
            >
              Content review
            </h2>
            <p className="max-w-xl text-sm leading-6 text-muted-foreground">
              Threads whose automated content check returned none or needs
              review.
            </p>
          </div>
          <div className="mt-5">
            <ReviewQueue scope="moderator" slug={society.slug} />
          </div>
        </section>
      )}
    </div>
  );
}
