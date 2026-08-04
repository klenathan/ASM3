import {
  ArrowBigDown,
  ArrowBigUp,
  ArrowLeft,
  ChevronDown,
  LogIn,
  MessageCircle,
  Plus,
  Share2,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { Button } from "../../components/ui/button";
import { Spinner } from "../../components/ui/spinner";
import { useAuth } from "../../features/auth/auth-context";
import { CommentComposer } from "../../features/discussions/comment-composer";
import { AnalysisBadge } from "../../features/discussions/analysis-badge";
import {
  CommentTree,
  type CommentSort,
} from "../../features/discussions/comment-tree";
import { MarkdownContent } from "../../features/discussions/markdown-content";
import { ThreadMedia } from "../../features/media/thread-media";
import { AuthorLink } from "../../features/profile/author-link";
import {
  useCommentVote,
  useCreateComment,
  useThread,
  useThreadComments,
  useThreadDetailVote,
} from "../../features/discussions/use-thread";
import { timeAgo } from "../../features/discussions/use-thread-vote";
import {
  useJoinSociety,
  useSociety,
  useSocietyMembership,
} from "../../features/societies/use-society";

export function ThreadPage() {
  const { slug = "", id = "" } = useParams();
  const { status } = useAuth();
  const isAuthenticated = status === "authenticated";
  const societyQuery = useSociety(slug);
  const membershipQuery = useSocietyMembership(slug, isAuthenticated);
  const threadQuery = useThread(id);
  const commentsQuery = useThreadComments(id);
  const createComment = useCreateComment(id);
  const voteThread = useThreadDetailVote(id);
  const voteComment = useCommentVote(id);
  const join = useJoinSociety(slug);
  const [sort, setSort] = useState<CommentSort>("best");

  const society = societyQuery.data;
  const thread = threadQuery.data;
  const isMember = membershipQuery.data?.status === "active";
  const comments =
    commentsQuery.data?.pages.flatMap((page) => page.items) ?? [];

  if (threadQuery.status === "pending" || societyQuery.status === "pending") {
    return (
      <ThreadShell>
        <div className="flex min-h-[50dvh] items-center justify-center">
          <Spinner />
        </div>
      </ThreadShell>
    );
  }

  if (
    threadQuery.status === "error" ||
    societyQuery.status === "error" ||
    thread === undefined ||
    society === undefined ||
    thread.societyId !== society.id
  ) {
    return (
      <ThreadShell>
        <div className="mx-auto flex min-h-[50dvh] max-w-xl flex-col justify-center py-16">
          <h1 className="font-heading text-4xl leading-none uppercase">
            This thread is unavailable.
          </h1>
          <p className="mt-4 leading-7 text-muted-foreground">
            It may have been removed, or the link may be incomplete.
          </p>
          <Button asChild variant="outline" className="mt-8 w-fit rounded-none">
            <Link to={`/s/${slug}`}>
              <ArrowLeft aria-hidden="true" /> Back to the society
            </Link>
          </Button>
        </div>
      </ThreadShell>
    );
  }

  const interactionNotice = !isAuthenticated
    ? "Sign in to join this discussion."
    : !isMember
      ? "Join this society to vote and reply."
      : null;

  return (
    <ThreadShell>
      <div className="mx-auto w-full max-w-7xl px-5 sm:px-8 lg:px-10 ">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_15rem] lg:gap-16">
          <main className="min-w-0">
            <article className="mt-5 border-y-2 border-foreground py-7 sm:py-9">
              <div className="flex gap-3">
                <div className="flex w-8 shrink-0 flex-col items-center pt-1 text-xs font-semibold text-muted-foreground">
                  <button
                    type="button"
                    disabled={!isMember || voteThread.isPending}
                    aria-label="Upvote thread"
                    aria-pressed={thread.myVote === 1}
                    onClick={() =>
                      voteThread.mutate(thread.myVote === 1 ? 0 : 1)
                    }
                    className={`rounded-sm p-1 transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-40 ${thread.myVote === 1 ? "text-primary" : ""}`}
                  >
                    <ArrowBigUp aria-hidden="true" className="size-5" />
                  </button>
                  <span className="py-1">{thread.score}</span>
                  <button
                    type="button"
                    disabled={!isMember || voteThread.isPending}
                    aria-label="Downvote thread"
                    aria-pressed={thread.myVote === -1}
                    onClick={() =>
                      voteThread.mutate(thread.myVote === -1 ? 0 : -1)
                    }
                    className={`rounded-sm p-1 transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-40 ${thread.myVote === -1 ? "text-primary" : ""}`}
                  >
                    <ArrowBigDown aria-hidden="true" className="size-5" />
                  </button>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <AuthorLink authorId={thread.authorId} />
                    <span>posted {timeAgo(thread.createdAt)}</span>
                    {thread.updatedAt !== thread.createdAt && (
                      <span>edited</span>
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <h1 className="text-balance font-heading text-[clamp(1rem,2vw,3rem)] leading-[0.93] font-semibold tracking-[-0.02em] uppercase">
                      {thread.title}
                    </h1>
                    <AnalysisBadge
                      decision={thread.analysisDecision}
                      className="h-6 px-2.5"
                    />
                  </div>
                  {thread.body !== null && (
                    <div className="mt-6">
                      <MarkdownContent>{thread.body}</MarkdownContent>
                    </div>
                  )}
                  {thread.mediaIds !== undefined &&
                    thread.mediaIds.length > 0 && (
                      <ThreadMedia
                        mediaIds={thread.mediaIds}
                        className="mt-7"
                      />
                    )}
                  <div className="mt-7 flex flex-wrap items-center gap-2 border-t border-foreground/15 pt-4">
                    <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
                      <MessageCircle aria-hidden="true" className="size-4" />{" "}
                      {thread.commentCount} comment
                      {thread.commentCount === 1 ? "" : "s"}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="rounded-none"
                      onClick={() =>
                        void navigator.clipboard?.writeText(
                          window.location.href,
                        )
                      }
                    >
                      <Share2 aria-hidden="true" /> Share
                    </Button>
                  </div>
                </div>
              </div>
            </article>

            <section aria-labelledby="discussion-title" className="mt-10">
              <div className="flex flex-wrap items-end justify-between gap-4 pb-4">
                <div>
                  <h2
                    id="discussion-title"
                    className="font-heading text-3xl leading-none font-semibold uppercase"
                  >
                    Discussion
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Follow a line, open its replies, or add your own.
                  </p>
                </div>
                <label className="relative text-sm font-medium">
                  <span className="sr-only">Sort comments</span>
                  <select
                    value={sort}
                    onChange={(event) =>
                      setSort(event.target.value as CommentSort)
                    }
                    className="appearance-none border-b border-foreground/30 bg-transparent py-1 pr-6 text-sm outline-none focus-visible:border-primary"
                  >
                    <option value="best">Best</option>
                    <option value="new">Newest</option>
                  </select>
                  <ChevronDown
                    aria-hidden="true"
                    className="pointer-events-none absolute right-0 top-1 size-4"
                  />
                </label>
              </div>

              <div className="mt-6">
                {isMember ? (
                  <CommentComposer
                    label="Add to the discussion"
                    submitLabel="Post comment"
                    isSubmitting={createComment.isPending}
                    error={createComment.error?.message}
                    onSubmit={async (body) => {
                      await createComment.mutateAsync({ body });
                    }}
                  />
                ) : (
                  <ParticipationPrompt
                    isAuthenticated={isAuthenticated}
                    isJoining={join.isPending}
                    error={join.error?.message}
                    onJoin={() => void join.mutateAsync()}
                  />
                )}
              </div>

              {commentsQuery.status === "pending" ? (
                <div className="flex justify-center py-14">
                  <Spinner />
                </div>
              ) : commentsQuery.status === "error" ? (
                <p
                  role="alert"
                  className="py-12 text-center text-muted-foreground"
                >
                  {commentsQuery.error.message}
                </p>
              ) : comments.length === 0 ? (
                <div className="py-14">
                  <h3 className="font-heading text-2xl uppercase">
                    No replies yet.
                  </h3>
                  <p className="mt-3 text-muted-foreground">
                    Start a useful thread for the people who arrive next.
                  </p>
                </div>
              ) : (
                <div className="mt-6">
                  <CommentTree
                    comments={comments}
                    sort={sort}
                    canInteract={isMember}
                    isSubmitting={createComment.isPending}
                    submitError={createComment.error?.message}
                    onReply={async (parentId, body) => {
                      await createComment.mutateAsync({ parentId, body });
                    }}
                    onVote={(commentId, value) =>
                      voteComment.mutate({ commentId, value })
                    }
                  />
                </div>
              )}
              {commentsQuery.hasNextPage && (
                <div className="mt-6 flex justify-center">
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-none"
                    disabled={commentsQuery.isFetchingNextPage}
                    onClick={() => void commentsQuery.fetchNextPage()}
                  >
                    {commentsQuery.isFetchingNextPage
                      ? "Loading replies"
                      : "Load more replies"}
                  </Button>
                </div>
              )}
            </section>
          </main>

          <aside className="lg:pt-12">
            <div className="border-t-2 border-foreground pt-4 lg:sticky lg:top-24">
              <h2 className="font-heading text-2xl leading-none uppercase">
                At this table
              </h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {society.description}
              </p>
              <Button
                asChild
                variant="outline"
                className="mt-5 w-full rounded-none"
              >
                <Link to={`/s/${slug}`}>Visit S/{society.name}</Link>
              </Button>
              {interactionNotice !== null && (
                <p className="mt-6 border-t border-foreground/15 pt-4 text-sm leading-6 text-muted-foreground">
                  {interactionNotice}
                </p>
              )}
            </div>
          </aside>
        </div>
      </div>
    </ThreadShell>
  );
}

function ThreadShell({ children }: { readonly children: ReactNode }) {
  return <div className="w-full">{children}</div>;
}

function ParticipationPrompt({
  isAuthenticated,
  isJoining,
  error,
  onJoin,
}: {
  readonly isAuthenticated: boolean;
  readonly isJoining: boolean;
  readonly error?: string;
  readonly onJoin: () => void;
}) {
  if (!isAuthenticated)
    return (
      <div className="border border-foreground/20 bg-card p-5">
        <p className="font-medium">
          Read along, then sign in to add to the conversation.
        </p>
        <Button asChild className="mt-4 rounded-none">
          <Link to="/sign-in">
            <LogIn aria-hidden="true" /> Sign in to reply
          </Link>
        </Button>
      </div>
    );
  return (
    <div className="border border-foreground/20 bg-card p-5">
      <p className="font-medium">Join this society to vote and reply.</p>
      <Button
        type="button"
        className="mt-4 rounded-none"
        disabled={isJoining}
        onClick={onJoin}
      >
        <Plus aria-hidden="true" /> {isJoining ? "Joining" : "Join society"}
      </Button>
      {error !== undefined && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
