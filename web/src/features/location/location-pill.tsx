import { MapPin } from "lucide-react";
import type { ThreadLocation } from "./types";

interface Props {
  readonly location: ThreadLocation;
  readonly onClick: () => void;
}

export function LocationPill({ location, onClick }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-foreground/15 bg-card px-2.5 py-1 text-xs font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      aria-label={`View location: ${location.name}`}
    >
      <MapPin className="size-3.5 shrink-0 text-primary" />
      <span className="truncate">{location.name}</span>
    </button>
  );
}
