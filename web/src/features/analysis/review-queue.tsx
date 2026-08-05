import { useState } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { MessageCircle } from "lucide-react";

import { Button } from "../../components/ui/button";
import { Skeleton } from "../../components/ui/skeleton";
import { Spinner } from "../../components/ui/spinner";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "../../components/ui/tabs";
import { AnalysisBadge } from "../discussions/analysis-badge";
import { AnalysisActions } from "./analysis-actions";
import { fetchAnalysisQueue } from "./analysis-api";
import type { AnalysisActionScope } from "./analysis-api";
import type { AnalysisQueueFilter, AnalysisQueueThread } from "./types";

const PAGE_LIMIT = 12;

const FILTERS: readonly { value: AnalysisQueueFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "review", label: "Needs review" },
  { value: "none", label: "None yet" },
];

function shortDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString(undefined, { dateStyle: "medium" });
}


function QueueCard({
  item,
  actionScope,
}: {
  readonly item: AnalysisQueueThread;
  readonly actionScope?: AnalysisActionScope;
}) {
  const queryClient = useQueryClient();
  // A removed thread is already hidden (auto-removed or manually removed), so
  // it is not "pending review"; present it as red "Hidden" rather than the
  // amber "Flagged for review" state reserved for published threads.
  const hidden = item.status === "removed";
  return (
    <article className="group flex flex-col border border-foreground/15 p-4 transition-colors hover:border-primary/50 hover:bg-muted/40">
      <div className="flex items-start justify-between gap-3">
        <AnalysisBadge
          decision={item.analysisDecision}
          failed={item.analysisFailed}
          hidden={hidden}
        />
        <span className="text-xs text-muted-foreground">{shortDate(item.createdAt)}</span>
      </div>
      <h3 className="mt-3 line-clamp-2 font-semibold leading-snug group-hover:text-primary">
        <Link
          to={`/s/${item.societySlug}/t/${item.id}`}
          className="hover:text-primary"
        >
          {item.title}
        </Link>
      </h3>
      {item.body !== null && item.body.length > 0 && (
        <p className="mt-1 line-clamp-2 text-sm leading-6 text-muted-foreground">
          {item.body}
        </p>
      )}
      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-4 text-xs text-muted-foreground">
        <span>{item.societyName}</span>
        <span aria-hidden="true">·</span>
        <span>
          {item.authorDisplayName === null
            ? "[deleted]"
            : `u/${item.authorDisplayName}`}
        </span>
        <span aria-hidden="true">·</span>
        <span className="inline-flex items-center gap-1">
          <MessageCircle aria-hidden="true" className="size-3.5" />
          {item.commentCount}
        </span>
      </div>
      {actionScope !== undefined && (
        <AnalysisActions
          threadId={item.id}
          actionScope={actionScope}
          decision={item.analysisDecision}
          failed={item.analysisFailed}
          onResolved={() =>
            queryClient.invalidateQueries({ queryKey: ["analysis", "queue"] })
          }
        />
      )}
    </article>
  );
}

function QueueSkeleton() {
  return (
    <div
      aria-label="Loading review queue"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      {Array.from({ length: 6 }).map((_, index) => (
        <Skeleton key={index} className="h-44 w-full" />
      ))}
    </div>
  );
}

/**
 * Grid of threads whose automated content-analysis outcome is "none" (no
 * decision yet) or "review" (flagged for review). Admin uses the global queue;
 * a moderator passes their society slug for the society-scoped queue. Each
 * resolved or stale-pending card offers Accept / Reject (override the
 * automated decision, publishing or hiding the post) and Re-analyze actions.
 */
export function ReviewQueue({
  scope,
  slug,
}: {
  readonly scope: "admin" | "moderator";
  readonly slug?: string;
}) {
  const [status, setStatus] = useState<AnalysisQueueFilter>("all");

  const actionScope: AnalysisActionScope =
    scope === "admin"
      ? { scope: "admin" }
      : { scope: "moderator", slug: slug ?? "" };

  const query = useInfiniteQuery({
    queryKey: ["analysis", "queue", scope, slug ?? "global", status],
    queryFn: ({ pageParam }) =>
      fetchAnalysisQueue({
        scope,
        slug,
        status,
        cursor: pageParam as string | undefined,
        limit: PAGE_LIMIT,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });

  const items = query.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div>
      <Tabs
        value={status}
        onValueChange={(value) => setStatus(value as AnalysisQueueFilter)}
      >
        <TabsList>
          {FILTERS.map((filter) => (
            <TabsTrigger key={filter.value} value={filter.value}>
              {filter.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="mt-4">
        {query.isLoading ? (
          <QueueSkeleton />
        ) : query.isError ? (
          <div className="border border-destructive/30 px-4 py-5">
            <p role="alert" className="text-sm text-destructive">
              {query.error?.message ?? "Could not load the review queue."}
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={() => void query.refetch()}
              className="mt-4"
            >
              Retry
            </Button>
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm leading-6 text-muted-foreground">
            No threads need review right now.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <QueueCard
                key={item.id}
                item={item}
                actionScope={actionScope}
              />
            ))}
          </div>
        )}
      </div>

      {query.hasNextPage && !query.isLoading && (
        <div className="mt-4 flex justify-center">
          <Button
            type="button"
            variant="outline"
            onClick={() => void query.fetchNextPage()}
            disabled={query.isFetchingNextPage}
          >
            {query.isFetchingNextPage ? "Loading…" : "Load more"}
          </Button>
        </div>
      )}

      {query.isFetchingNextPage && (
        <div className="mt-4 flex justify-center text-muted-foreground">
          <Spinner />
        </div>
      )}
    </div>
  );
}
