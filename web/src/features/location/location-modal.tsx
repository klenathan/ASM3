import { useEffect, useRef } from "react";
import { ExternalLink, MapPin } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import type { ThreadLocation } from "./types";

interface Props {
  readonly location: ThreadLocation | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

export function LocationModal({ location, open, onOpenChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !location || !containerRef.current) return;
    const token = import.meta.env.VITE_MAPBOX_PUBLIC_TOKEN as string | undefined;
    if (!token) return;
    let map: unknown;
    (async () => {
      try {
        const mod = await import("mapbox-gl");
        const mapboxgl = (mod as unknown as { default: typeof import("mapbox-gl").default }).default ?? (mod as unknown as typeof import("mapbox-gl").default);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (mapboxgl as any).accessToken = token;
        const isDark = document.documentElement.classList.contains("dark");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const m = new (mapboxgl as any).Map({
          container: containerRef.current!,
          style: isDark ? "mapbox://styles/mapbox/dark-v11" : "mapbox://styles/mapbox/streets-v12",
          center: [location.longitude, location.latitude],
          zoom: 14,
          attributionControl: false,
        });
        map = m;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const markerColor = isDark ? "oklch(0.72 0.17 32)" : "oklch(0.53 0.18 32)";
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        new (mapboxgl as any).Marker({ color: markerColor }).setLngLat([location.longitude, location.latitude]).addTo(m);
      } catch {
        // fallback to text
      }
    })();
    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const m = map as any;
      if (m?.remove) m.remove();
    };
  }, [open, location]);

  if (!location) return null;

  const mapboxUrl = `https://www.mapbox.com/search/${encodeURIComponent(location.name)}/${location.longitude},${location.latitude}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl gap-0 overflow-hidden p-0 sm:max-w-2xl max-sm:h-[100dvh] max-sm:max-w-none max-sm:rounded-none">
        <DialogHeader className="border-b border-foreground/10 px-4 py-3 sm:px-5">
          <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
            <MapPin className="size-4 text-primary" />
            <span className="truncate">{location.name}</span>
          </DialogTitle>
        </DialogHeader>
        <div ref={containerRef} className="h-[400px] w-full bg-muted max-sm:h-[55dvh]" aria-label="Location map" />
        <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
          <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            {(location.address as unknown as { full_address?: string } | null)?.full_address ?? `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`}
          </p>
          <a
            href={mapboxUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-none border border-foreground/15 px-3 py-1.5 text-xs font-medium hover:bg-muted"
          >
            <ExternalLink className="size-3.5" /> Open in Mapbox
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}
