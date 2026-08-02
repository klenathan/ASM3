import { type ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";

import { LogoMark } from "../../components/site/LogoMark";
import { Button } from "../../components/ui/button";

interface StatusPageProps {
  readonly icon: ReactNode;
  readonly code: string;
  readonly title: string;
  readonly detail: string;
  readonly action: string;
  readonly onAction: () => void;
  readonly secondary?: string;
  readonly onSecondary?: () => void;
}

export function StatusPage({
  icon,
  code,
  title,
  detail,
  action,
  onAction,
  secondary,
  onSecondary,
}: StatusPageProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 border-b border-foreground/15 px-6 py-5 lg:px-10">
        <LogoMark />
        <span className="bg-signal px-2 py-1 text-xs font-bold tracking-[0.12em] text-signal-foreground uppercase">
          {code}
        </span>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-6 py-16 sm:py-24">
        <div
          aria-hidden="true"
          className="flex size-12 items-center justify-center bg-foreground text-background"
        >
          {icon}
        </div>
        <h1 className="mt-8 font-heading text-[clamp(2.25rem,5vw,3.75rem)] leading-[1.02] font-semibold tracking-[-0.01em] text-balance uppercase">
          {title}
        </h1>
        <p className="mt-6 max-w-xl text-lg leading-8 text-muted-foreground">
          {detail}
        </p>
        <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-4">
          <Button
            type="button"
            size="lg"
            onClick={onAction}
            className="h-12 rounded-none px-5 text-base font-semibold shadow-none"
          >
            {action}
            <ArrowUpRight aria-hidden="true" />
          </Button>
          {secondary && onSecondary && (
            <Button
              type="button"
              variant="ghost"
              onClick={onSecondary}
              className="h-12 rounded-none px-2 text-base text-muted-foreground hover:text-foreground"
            >
              {secondary}
            </Button>
          )}
        </div>
      </main>
    </div>
  );
}
