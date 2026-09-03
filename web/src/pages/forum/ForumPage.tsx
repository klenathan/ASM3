import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";

import { HomeFeed } from "../../features/feed/home-feed";

export function ForumPage() {
  return (
    <main className="w-full">
      <section aria-labelledby="forum-title" className="max-w-3xl">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b-2 border-foreground pb-4">
          <h1
            id="forum-title"
            className="font-heading text-[clamp(2.5rem,5vw,4rem)] leading-none font-semibold tracking-[-0.02em] uppercase"
          >
            The forum is open.
          </h1>
          <span className="pb-1 text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase">
            Today <span aria-hidden="true">/</span> Issue 01
          </span>
        </div>

        <div className="mt-8 flex items-center justify-between gap-4 border-b border-foreground/15 pb-3">
          <h2 className="font-heading text-sm font-semibold tracking-[0.08em] uppercase">
            Latest from your societies
          </h2>
          <Link
            to="/societies"
            className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-primary transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Browse all
            <ArrowUpRight aria-hidden="true" className="size-3.5" />
          </Link>
        </div>

        <div>
          <HomeFeed />
        </div>
      </section>
    </main>
  );
}
