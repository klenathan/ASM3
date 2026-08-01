import { ArrowRight, Check, GraduationCap, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "@/auth/auth-provider";
import { useJoinSociety, useSocieties } from "@/lib/api/queries";
import { toMember, toSpace } from "@/lib/model";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

export function EntryPage() {
  const navigate = useNavigate();
  const { user, token } = useAuth();
  const { data: societies, isLoading } = useSocieties(Boolean(token && user));
  const join = useJoinSociety();

  const [joined, setJoined] = useState<Set<string>>(
    () => new Set((societies ?? []).filter((s) => s.member_count > 0).map((s) => s.society_id))
  );

  const spaces = (societies ?? []).map(toSpace);
  const member = user ? toMember(user) : undefined;

  const toggle = (id: string) => {
    setJoined((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setJoined(new Set((societies ?? []).map((s) => s.society_id)));
  const clearAll = () => setJoined(new Set());

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.04] dark:opacity-[0.05]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, var(--ink) 0 1px, transparent 1px 40px)",
        }}
        aria-hidden
      />

      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-4 py-6">
        <div className="flex items-center gap-2 font-display text-lg font-black tracking-tight">
          <span
            className="flex size-8 items-center justify-center rounded-md text-white"
            style={{ background: "var(--stamp)" }}
          >
            R
          </span>
          commonroom
        </div>
        <Button variant="outline" size="sm" onClick={() => navigate("/feed")}>
          Sign in
          <ArrowRight className="size-3.5" />
        </Button>
      </header>

      <main className="relative z-10 mx-auto max-w-6xl px-4">
        <section className="grid items-center gap-10 py-10 md:grid-cols-[1.1fr_1fr] md:py-16">
          <div>
            <p className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-muted-foreground">
              <GraduationCap className="size-3.5" />
              Verified RMIT membership
            </p>
            <h1 className="font-display text-5xl leading-[0.95] font-black tracking-tight sm:text-6xl md:text-7xl">
              Your campus, as a common room.
            </h1>
            <p className="mt-5 max-w-md text-lg leading-relaxed text-muted-foreground">
              Join the clubs and communities that make RMIT feel like yours.
              Post, ask and reply — with people who are actually on your campus.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Button size="lg" onClick={() => navigate("/feed")}>
                Get your member card
                <ArrowRight className="size-4" />
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="gap-2"
                onClick={() => navigate("/feed")}
              >
                <ShieldCheck className="size-4 text-stamp" />
                Safety-first
              </Button>
            </div>
          </div>

          <div
            className="card-rise relative overflow-hidden rounded-lg border border-border bg-card p-7 shadow-[0_24px_60px_-30px_rgba(0,0,0,0.4)]"
            style={{
              backgroundImage:
                "linear-gradient(135deg, color-mix(in oklch, var(--card), var(--stamp) 7%), var(--card) 55%)",
            }}
          >
            <div className="flex items-center justify-between">
              <span className="font-display text-xs font-bold tracking-[0.2em] text-muted-foreground uppercase">
                Member card
              </span>
              <span
                className="rounded-sm px-2 py-0.5 font-display text-xs font-black tracking-widest text-white"
                style={{ background: "var(--stamp)" }}
              >
                ACTIVE
              </span>
            </div>
            <div className="mt-6 flex items-center gap-4">
              <span
                className="flex size-16 items-center justify-center rounded-full font-display text-xl font-black text-white"
                style={{ background: "var(--stamp)" }}
              >
                {member ? member.initials : "RM"}
              </span>
              <div>
                <p className="font-display text-2xl font-black tracking-tight">
                  {member ? member.name : "The common room"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {member
                    ? `@${member.handle} · ${member.school || "RMIT"}`
                    : "Verified membership with your campus"}
                </p>
              </div>
            </div>
            <div className="mt-6 grid grid-cols-3 gap-3 border-t border-border pt-5 text-center">
              {[(societies ?? []).length, joined.size, member ? 1 : 0].map((n, i) => (
                <div key={i}>
                  <p className="font-display text-2xl font-black tabular-nums">{n}</p>
                  <p className="text-xs text-muted-foreground">
                    {["Spaces", "Joined", "You"][i]}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-border py-12">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-display text-3xl font-black tracking-tight">
                Stamp your card with the clubs you care about
              </h2>
              <p className="mt-2 max-w-lg text-muted-foreground">
                Pick a few to follow. You can change these any time from your
                profile.
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={selectAll}>
                Select all
              </Button>
              <Button variant="ghost" size="sm" onClick={clearAll}>
                Clear
              </Button>
            </div>
          </div>

          {isLoading ? (
            <div className="mt-8 flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner className="size-4" />
              Loading spaces…
            </div>
          ) : (
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {spaces.map((s) => {
                const active = joined.has(s.id);
                return (
                  <button
                    key={s.id}
                    onClick={() => toggle(s.id)}
                    aria-pressed={active}
                    className={cn(
                      "flex items-center justify-between rounded-md border p-4 text-left transition-all",
                      active
                        ? "border-stamp/50 bg-stamp/5"
                        : "border-border bg-card hover:border-border/70"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="flex size-10 shrink-0 items-center justify-center rounded-full font-display text-xs font-bold text-white"
                        style={{ background: `oklch(0.55 0.15 ${s.hue})` }}
                      >
                        {s.curie}
                      </span>
                      <div className="leading-tight">
                        <p className="font-display font-bold">{s.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {s.tagline}
                        </p>
                      </div>
                    </div>
                    <span
                      className={cn(
                        "flex size-5 shrink-0 items-center justify-center rounded-full border",
                        active
                          ? "border-transparent bg-stamp text-stamp-foreground"
                          : "border-border text-transparent"
                      )}
                    >
                      <Check className="size-3" />
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          <div className="mt-10 flex items-center justify-center gap-3">
            <Button
              size="lg"
              onClick={() => {
                if (token) {
                  joined.forEach((id) => {
                    const s = (societies ?? []).find((x) => x.society_id === id);
                    if (s) join.mutate(s.slug);
                  });
                }
                navigate("/feed");
              }}
              disabled={joined.size === 0}
            >
              <span className="tabular-nums">{joined.size}</span> joined — enter
              the common room
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </section>
      </main>
    </div>
  );
}
