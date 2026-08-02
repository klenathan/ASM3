import { LogoMark } from "../../components/site/LogoMark";

export function LoadingPage({ label }: { label: string }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="mx-auto flex w-full max-w-7xl items-center justify-between border-b border-foreground/15 px-6 py-5 lg:px-10">
        <LogoMark />
        <span className="text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase">
          RMIT community forum
        </span>
      </header>
      <main
        className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-6 py-16"
        role="status"
        aria-live="polite"
      >
        <div aria-hidden="true" className="space-y-4">
          <span className="block h-3 w-2/5 animate-pulse bg-foreground/15" />
          <span className="block h-3 w-3/5 animate-pulse bg-foreground/10 [animation-delay:120ms]" />
          <span className="block h-3 w-1/2 animate-pulse bg-foreground/10 [animation-delay:240ms]" />
        </div>
        <p className="mt-8 text-sm font-medium tracking-[0.08em] text-muted-foreground uppercase">
          {label}…
        </p>
      </main>
    </div>
  );
}
