import { Check, Users } from "lucide-react";
import { useState } from "react";

import type { SpaceView } from "@/lib/model";
import { cn } from "@/lib/utils";

import { Button } from "./ui/button";

export function SpaceCard({
  space,
  onOpen,
  onToggleJoin,
}: {
  space: SpaceView;
  onOpen: (id: string) => void;
  onToggleJoin?: (id: string, join: boolean) => void;
}) {
  const [joined, setJoined] = useState(false);
  const fmt = Intl.NumberFormat("en-AU", { notation: "compact" }).format(
    space.members
  );

  const toggle = () => {
    const next = !joined;
    setJoined(next);
    onToggleJoin?.(space.id, next);
  };

  return (
    <article
      onClick={() => onOpen(space.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(space.id);
        }
      }}
      className="group flex cursor-pointer flex-col gap-3 rounded-md border border-border bg-card p-4 text-card-foreground shadow-[0_1px_2px_rgba(0,0,0,0.06)] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring dark:shadow-[0_1px_0_rgba(255,255,255,0.05)]"
    >
      <div className="flex items-center gap-3">
        <span
          className="flex size-10 shrink-0 items-center justify-center rounded-full font-display text-xs font-bold tracking-wide text-white"
          style={{ background: `oklch(0.55 0.15 ${space.hue})` }}
        >
          {space.curie}
        </span>
        <div className="min-w-0 leading-tight">
          <h3 className="truncate font-display text-base font-bold tracking-tight">
            {space.name}
          </h3>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Users className="size-3" />
            <span className="tabular-nums">{fmt}</span> members
          </p>
        </div>
      </div>

      <p className="text-sm leading-relaxed text-foreground/80">
        {space.tagline}
      </p>

      <div className="mt-auto">
        <Button
          variant={joined ? "outline" : "default"}
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            toggle();
          }}
          className={cn("w-full", joined && "border-stamp/40 text-stamp hover:bg-stamp/5")}
        >
          {joined && <Check className="size-3.5" />}
          {joined ? "Member" : "Join space"}
        </Button>
      </div>
    </article>
  );
}
