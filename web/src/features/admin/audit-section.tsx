import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ChevronDown, RefreshCw } from "lucide-react";

import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Skeleton } from "../../components/ui/skeleton";

import { fetchAuditEvents, type AuditEvent } from "./audit-api";

const PAGE_LIMIT = 50;

function eventLabel(eventType: string): string {
  const map: Record<string, string> = {
    "thread.created": "Thread created",
  };
  return map[eventType] ?? eventType;
}

function shortId(value: string): string {
  return value.slice(0, 8);
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
  });
}

function Payload({ payload }: { payload: Readonly<Record<string, unknown>> }) {
  const [open, setOpen] = useState(false);

  if (Object.keys(payload).length === 0) {
    return <span className="text-xs text-muted-foreground">No payload</span>;
  }

  return (
    <div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <ChevronDown
          aria-hidden="true"
          className={open ? "rotate-180 transition-transform" : "transition-transform"}
        />
        {open ? "Hide details" : "Show details"}
      </Button>
      {open && (
        <pre className="mt-2 max-w-full overflow-x-auto rounded border border-foreground/10 bg-background/40 p-3 font-mono text-xs leading-5">
          {JSON.stringify(payload, null, 2)}
        </pre>
      )}
    </div>
  );
}

function AuditRow({ event }: { event: AuditEvent }) {
  return (
    <li className="flex flex-col gap-2 border-b border-foreground/10 px-4 py-3 last:border-b-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Badge variant="secondary">{eventLabel(event.eventType)}</Badge>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {event.title ?? `Event ${shortId(event.id)}`}
        </span>
        <span className="text-xs tabular-nums text-muted-foreground">
          {formatTime(event.receivedAt)}
        </span>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>
          v{event.version} · source <span className="font-mono">{shortId(event.sourceEventId)}</span>
        </span>
        {event.authorId && <span>author {shortId(event.authorId)}</span>}
        {event.societyId && <span>society {shortId(event.societyId)}</span>}
        {event.threadId && <span>thread {shortId(event.threadId)}</span>}
      </div>
      <Payload payload={event.payload} />
    </li>
  );
}

export function AuditSection() {
  const query = useInfiniteQuery({
    queryKey: ["admin", "audit"],
    queryFn: ({ pageParam }) =>
      fetchAuditEvents({ cursor: pageParam as string | undefined, limit: PAGE_LIMIT }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });

  const events = query.data?.pages.flatMap((page) => page.items) ?? [];
  const canLoadMore = query.hasNextPage;

  return (
    <section aria-labelledby="audit-heading">
      <h2
        id="audit-heading"
        className="font-heading text-2xl font-semibold tracking-[0.01em] text-balance uppercase"
      >
        Audit &amp; event trail
      </h2>
      <p className="mt-2 max-w-lg leading-7 text-muted-foreground">
        Platform events captured from the background event pipeline.
      </p>

      <div className="mt-6 flex items-center justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={() => void query.refetch()}
          disabled={query.isFetching && !query.isFetchingNextPage}
        >
          <RefreshCw
            aria-hidden="true"
            className={query.isFetching && !query.isFetchingNextPage ? "animate-spin" : undefined}
          />
          Refresh
        </Button>
      </div>

      <div className="mt-2 border bg-card">
        {query.isPending && (
          <div className="space-y-3 p-4" aria-label="Loading event trail">
            {[0, 1, 2, 3, 4].map((index) => (
              <Skeleton key={index} className="h-12 w-full" />
            ))}
          </div>
        )}

        {query.isError && (
          <div className="p-4">
            <p role="alert" className="text-sm text-destructive">
              {query.error?.message}
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={() => void query.refetch()}
              className="mt-4"
            >
              <RefreshCw aria-hidden="true" />
              Retry
            </Button>
          </div>
        )}

        {query.isSuccess && events.length === 0 && (
          <p className="py-8 px-4 leading-7 text-muted-foreground">
            No events recorded yet. Published threads appear here automatically.
          </p>
        )}

        {query.isSuccess && events.length > 0 && (
          <ol>
            {events.map((event) => (
              <AuditRow key={event.id} event={event} />
            ))}
          </ol>
        )}
      </div>

      {canLoadMore && (
        <div className="mt-4">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => query.fetchNextPage()}
            disabled={query.isFetchingNextPage}
          >
            {query.isFetchingNextPage ? "Loading…" : "Load more"}
          </Button>
        </div>
      )}
    </section>
  );
}
