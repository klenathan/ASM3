import { HomeFeed } from "../../features/feed/home-feed";

export function ForumPage() {
  return (
    <main className="px-5 sm:px-8 lg:px-10 max-w-7xl w-full">
      <section aria-labelledby="forum-title">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b-2 border-foreground pb-4">
          <h1
            id="forum-title"
            className="font-heading text-[clamp(2.25rem,4.5vw,3.5rem)] leading-none font-semibold tracking-[-0.01em] uppercase"
          >
            The forum is open.
          </h1>
          <span className="text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase">
            Today <span aria-hidden="true">/</span> Issue 01
          </span>
        </div>

        <div className="mt-8">
          <HomeFeed />
        </div>
      </section>
    </main>
  );
}
