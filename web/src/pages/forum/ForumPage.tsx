import { SocietyIndex } from "../../features/societies/society-index";
import { HomeFeed } from "../../features/feed/home-feed";

export function ForumPage() {
  return (
    <main className="mx-auto grid w-full max-w-7xl flex-1 gap-10 px-6 py-10 lg:grid-cols-[minmax(14rem,18rem)_minmax(0,1fr)] lg:gap-14 lg:px-10 lg:py-14">
      <aside aria-label="Society index">
        <SocietyIndex />
      </aside>

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
