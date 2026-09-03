import { ArrowRight, ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "../../components/ui/button";
import { LogoMark } from "../../components/site/LogoMark";
import { useAuth } from "../../features/auth/auth-context";
import { AnalysisBadge } from "@/features/discussions/analysis-badge";

const indexItems = [
  {
    label: "Find a society",
    detail: "Create your account to browse student communities.",
    to: "/register",
  },
  {
    label: "Join a thread",
    detail: "Sign in to read and post in active discussions.",
    to: "/sign-in",
  },
  {
    label: "Keep it accountable",
    detail: "Sign in to report content and support healthy discussion.",
    to: "/sign-in",
  },
];

export function LandingPage() {
  const { status } = useAuth();

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="mx-auto flex w-full max-w-7xl items-center justify-between border-b border-foreground/15 px-6 py-5 lg:px-10">
        <LogoMark />
        <div className="flex items-center gap-3 text-right text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase sm:gap-6">
          <span className="hidden sm:inline">RMIT community forum</span>
          <span aria-hidden="true" className="text-primary">
            /
          </span>
          <span>2026</span>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-7xl flex-1 content-center gap-12 px-6 py-16 sm:py-24 lg:grid-cols-[minmax(0,1.25fr)_minmax(19rem,0.75fr)] lg:items-center lg:gap-20 lg:px-10">
        <section aria-labelledby="landing-title">
          <h1
            id="landing-title"
            className="max-w-4xl font-heading text-[clamp(3rem,7.5vw,5.75rem)] leading-[0.95] font-semibold tracking-[-0.01em] text-balance uppercase"
          >
            Find and join RMIT societies and campus threads.
          </h1>
          <p className="mt-8 max-w-2xl text-lg leading-8 text-muted-foreground sm:text-xl">
            RMIT Society is the unofficial forum for approved RMIT students.
            Societies are shared student communities; threads are the
            conversations inside them. Find one to follow, then join in.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-4">
            <Button
              asChild
              size="lg"
              className="h-12 rounded-none px-5 text-base font-semibold shadow-none"
            >
              <Link to="/register">
                Create account
                <ArrowUpRight aria-hidden="true" />
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="h-12 rounded-none px-5 text-base font-semibold shadow-none"
            >
              <Link to="/sign-in">Sign in</Link>
            </Button>
            <p className="max-w-xs text-sm leading-6 text-muted-foreground">
              New here? Create an account with your approved RMIT email. Already
              a member? Sign in.
            </p>
          </div>
          {status === "loading" && (
            <p
              className="mt-4 text-sm text-muted-foreground"
              role="status"
              aria-live="polite"
            >
              Checking session…
            </p>
          )}
        </section>

        <aside
          aria-label="Ways to enter RMIT Society"
          className="bg-card ring-1 ring-foreground/15"
        >
          <div className="flex items-center justify-between border-b border-foreground/15 px-5 py-4 text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            <span>RMIT / Society</span>
            <span className="text-primary">Index</span>
          </div>
          <div className="divide-y divide-foreground/15">
            {indexItems.map((item, index) => (
              <Link
                className="group flex items-start gap-4 px-5 py-5 transition-colors hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                key={item.label}
                to={item.to}
              >
                <span className="w-6 pt-0.5 text-sm font-semibold text-primary tabular-nums">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="flex-1">
                  <strong className="block font-heading text-lg font-medium tracking-[0.01em] uppercase">
                    {item.label}
                  </strong>
                  <span className="mt-1 block text-sm leading-6 text-muted-foreground">
                    {item.detail}
                  </span>
                </span>
                <ArrowRight
                  aria-hidden="true"
                  className="mt-1 size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary"
                />
              </Link>
            ))}
          </div>
          <p className="border-t border-foreground/15 px-5 py-5 text-sm leading-6 text-muted-foreground">
            Access is limited to approved RMIT identities across the AU, VN, and
            EU community.
          </p>
        </aside>
      </main>

      <footer className="mx-auto flex w-full max-w-7xl flex-col gap-2 border-t border-foreground/15 px-6 py-5 text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase sm:flex-row sm:items-center sm:justify-between lg:px-10">
        <span>Unofficial student community space</span>
        <span>Use your approved RMIT email to enter</span>
      </footer>
    </div>
  );
}
