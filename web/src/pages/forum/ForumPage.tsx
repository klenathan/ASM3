import { ArrowRight, BookOpen } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Button } from "../../components/ui/button";

export function ForumPage() {
  const navigate = useNavigate();
  return (
    <main className="mx-auto grid w-full max-w-7xl flex-1 gap-10 px-6 py-10 lg:grid-cols-[minmax(14rem,18rem)_minmax(0,1fr)] lg:gap-14 lg:px-10 lg:py-14">
      <aside aria-label="Society index" className="lg:pt-1">
        <h2 className="font-heading text-2xl font-semibold tracking-[0.01em] uppercase">
          Your index
        </h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Your society shelf is waiting for its first entry.
        </p>
        <Button
          type="button"
          variant="outline"
          onClick={() => navigate("/societies")}
          className="mt-5 h-11 w-full justify-start rounded-none border-foreground/20 px-3 shadow-none"
        >
          <span aria-hidden="true" className="text-primary">
            +
          </span>{" "}
          Discover societies
        </Button>
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

        <div className="mt-12 flex flex-col items-start gap-5 border-t border-foreground/15 pt-10">
          <div
            aria-hidden="true"
            className="flex size-12 items-center justify-center bg-foreground text-background"
          >
            <BookOpen size={24} strokeWidth={1.5} />
          </div>
          <h2 className="font-heading text-2xl font-semibold tracking-[0.01em] uppercase">
            Make the first mark.
          </h2>
          <p className="max-w-md leading-7 text-muted-foreground">
            Threads from societies you join will collect here. Start by
            finding a community that feels like yours.
          </p>
          <Button
            type="button"
            size="lg"
            onClick={() => navigate("/societies")}
            className="h-12 rounded-none px-5 text-base font-semibold shadow-none"
          >
            Browse societies
            <ArrowRight aria-hidden="true" />
          </Button>
        </div>
      </section>
    </main>
  );
}
