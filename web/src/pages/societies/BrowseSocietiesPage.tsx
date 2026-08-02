import { Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Skeleton } from "../../components/ui/skeleton";
import { Spinner } from "../../components/ui/spinner";
import { SocietyCard } from "../../features/societies/society-card";
import { useSocietyDiscovery } from "../../features/societies/use-society";

export function BrowseSocietiesPage() {
  const [params, setParams] = useSearchParams();
  const urlQuery = params.get("q") ?? "";
  const [draft, setDraft] = useState(urlQuery);

  useEffect(() => {
    setDraft(urlQuery);
  }, [urlQuery]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (draft === urlQuery) return;
      const next = new URLSearchParams();
      if (draft.trim() !== "") next.set("q", draft.trim());
      setParams(next, { replace: true });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [draft, urlQuery, setParams]);

  const {
    data,
    status,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetching,
  } = useSocietyDiscovery(urlQuery);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = sentinelRef.current;
    if (node === null) return;
    if (!hasNextPage) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void fetchNextPage();
      },
      { rootMargin: "400px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, fetchNextPage]);

  const societies = data?.pages.flatMap((page) => page.items) ?? [];
  const searching = draft.trim() !== "";

  return (
    <div className="mx-auto w-full max-w-4xl flex-1 px-6 lg:px-10">
      <section aria-labelledby="browse-title">
        <h1
          id="browse-title"
          className="font-heading text-[clamp(2.25rem,4.5vw,3.5rem)] leading-none font-semibold tracking-[-0.01em] uppercase"
        >
          Find a table that fits.
        </h1>
        <p className="mt-6 max-w-xl leading-7 text-muted-foreground">
          Every RMIT Society is a shared reading table for one kind of
          conversation. Pick one, join it, and make the first mark.
        </p>

        <form
          role="search"
          className="relative mt-10 max-w-xl"
          onSubmit={(event) => event.preventDefault()}
        >
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={
              searching ? "Refine your search…" : "Search societies…"
            }
            aria-label="Search societies"
            className="h-13 w-full rounded-none border-foreground/20 bg-card py-3.5 pr-4 pl-12 text-base focus-visible:border-primary focus-visible:ring-primary/40"
          />
        </form>
      </section>

      <section aria-label="Societies" className="mt-12">
        {status === "pending" && !isFetching ? (
          <div className="border-t border-foreground/15">
            {[0, 1, 2, 3].map((index) => (
              <div key={index} className="border-b border-foreground/15 py-6">
                <Skeleton className="h-6 w-56" />
                <Skeleton className="mt-3 h-4 w-3/4" />
              </div>
            ))}
          </div>
        ) : status === "error" ? (
          <div className="border-t border-foreground/15 py-12 text-center">
            <p className="text-muted-foreground">{error.message}</p>
            <Button
              type="button"
              variant="outline"
              className="mt-5 h-11 rounded-none border-foreground/20 px-4 shadow-none"
              onClick={() => void fetchNextPage()}
            >
              Try again
            </Button>
          </div>
        ) : societies.length === 0 ? (
          <div className="border-t border-foreground/15 py-14">
            <h2 className="font-heading text-2xl font-semibold tracking-[0.01em] uppercase">
              {searching
                ? "No pages match."
                : "This shelf is waiting to be written."}
            </h2>
            <p className="mt-3 max-w-md text-muted-foreground">
              {searching
                ? "Nothing under that mark yet. Try a different word."
                : "The first society pages haven" + "'" + "t been cut yet."}
            </p>
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between border-b-2 border-foreground pb-3">
              <h2 className="font-heading text-sm font-semibold tracking-[0.08em] uppercase">
                {searching ? `Pages matching “${urlQuery}”` : "All societies"}
              </h2>
              <span className="text-xs text-muted-foreground">
                {societies.length} shown
              </span>
            </div>
            <div>
              {societies.map((society) => (
                <SocietyCard key={society.id} society={society} />
              ))}
            </div>
            <div ref={sentinelRef} aria-hidden="true" className="h-px" />
            {isFetchingNextPage && (
              <div className="flex justify-center py-8 text-muted-foreground">
                <Spinner />
              </div>
            )}
          </div>
        )}
      </section>

      {isFetching &&
        status === "success" &&
        !isFetchingNextPage &&
        societies.length > 0 && (
          <p
            aria-live="polite"
            className="mt-4 text-center text-xs text-muted-foreground"
          >
            Refining…
          </p>
        )}
    </div>
  );
}
