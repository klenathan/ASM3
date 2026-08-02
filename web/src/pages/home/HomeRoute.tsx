import { ArrowRight, ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { useAuth } from "../../features/auth/auth-context";
import { ForumPage } from "../forum/ForumPage";
import { ForbiddenPage, LoadingPage } from "../status";
import { ProtectedLayout } from "../../app/ProtectedLayout";

const indexItems = [
  "Find a society",
  "Join the thread",
  "Keep it accountable",
];

function Brand() {
  return (
    <Link
      className="font-heading text-xl font-bold tracking-[-0.04em] text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4"
      to="/"
    >
      <span className="text-primary">RMIT</span> Society
    </Link>
  );
}

function PublicHome() {
  const { status } = useAuth();

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="mx-auto flex w-full max-w-7xl items-center justify-between border-b border-foreground/15 px-6 py-5 lg:px-10">
        <Brand />
        <div className="flex items-center gap-3 text-right text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase sm:gap-6">
          <span className="hidden sm:inline">RMIT community forum</span>
          <span aria-hidden="true" className="text-primary">
            /
          </span>
          <span>2026</span>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-7xl gap-12 px-6 py-16 sm:py-24 lg:grid-cols-[minmax(0,1.25fr)_minmax(19rem,0.75fr)] lg:items-center lg:gap-20 lg:px-10 lg:py-28">
        <section aria-labelledby="home-title">
          <h1
            id="home-title"
            className="max-w-4xl font-heading text-[clamp(3.25rem,8vw,6rem)] leading-[0.92] font-bold tracking-[-0.04em] text-balance"
          >
            Make room for better conversations.
          </h1>
          <p className="mt-8 max-w-2xl text-lg leading-8 text-muted-foreground sm:text-xl">
            RMIT Society is a shared reading table for student communities —
            discover societies, start threads, and keep campus conversation
            moving.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <Button
              asChild
              size="lg"
              className="h-12 rounded-none px-5 text-base font-semibold shadow-none"
            >
              <Link to="/sign-in">
                Sign in to RMIT Society
                <ArrowUpRight aria-hidden="true" />
              </Link>
            </Button>
            {status === "loading" && (
              <span className="text-sm text-muted-foreground" aria-live="polite">
                Checking session…
              </span>
            )}
          </div>
        </section>

        <Card className="rounded-none border-0 bg-card py-0 shadow-none ring-1 ring-foreground/15">
          <CardContent className="p-0">
            <div className="flex items-center justify-between border-b border-foreground/15 px-5 py-4 text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
              <span>RMIT / Society</span>
              <span className="text-primary">Index</span>
            </div>
            <div className="divide-y divide-foreground/15">
              {indexItems.map((item, index) => (
                <div
                  className="group flex items-center gap-4 px-5 py-5 transition-colors hover:bg-primary/5"
                  key={item}
                >
                  <span className="w-6 text-sm font-semibold text-primary">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <strong className="flex-1 font-heading text-lg tracking-[-0.02em]">
                    {item}
                  </strong>
                  <ArrowRight
                    aria-hidden="true"
                    className="size-5 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary"
                  />
                </div>
              ))}
            </div>
            <p className="border-t border-foreground/15 px-5 py-5 text-sm leading-6 text-muted-foreground">
              For approved RMIT identities across the AU, VN, and EU community.
            </p>
          </CardContent>
        </Card>
      </main>

      <footer className="mx-auto flex w-full max-w-7xl flex-col gap-2 border-t border-foreground/15 px-6 py-5 text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase sm:flex-row sm:items-center sm:justify-between lg:px-10">
        <span>Unofficial student community space</span>
        <span>Use your approved RMIT email to enter</span>
      </footer>
    </div>
  );
}

export function HomeRoute() {
  const { status, error } = useAuth();

  if (status === "loading")
    return <LoadingPage label="Checking your place at the table" />;
  if (status === "forbidden") return <ForbiddenPage detail={error?.message} />;
  if (status === "authenticated")
    return (
      <ProtectedLayout>
        <ForumPage />
      </ProtectedLayout>
    );
  return <PublicHome />;
}
