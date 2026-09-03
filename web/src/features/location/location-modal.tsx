import { useEffect, useRef, useState } from "react";
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
  const [mapFailed, setMapFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!open || !location) return;
    setMapFailed(false);
    const token = import.meta.env.VITE_MAPBOX_PUBLIC_TOKEN as string | undefined;
    if (!token) {
      setMapFailed(true);
      return;
    }
    if (!containerRef.current) return;
    let map: { remove?: () => void } | undefined;
    (async () => {
      try {
        // Dynamic import mapbox-gl to avoid heavy WebGL bundle on initial load and handle missing WebGL
        const mod = await import("mapbox-gl");
        const mapboxgl = (mod as unknown as { default: { accessToken: string; Map: new (opts: unknown) => { remove: () => void; on: (event: string, listener: (e: unknown) => void) => void }; Marker: new (opts: unknown) => { setLngLat: (coords: [number, number]) => { addTo: (map: unknown) => void } } } }).default;
        mapboxgl.accessToken = token;
        const isDark = document.documentElement.classList.contains("dark");
        const m = new mapboxgl.Map({
          container: containerRef.current!,
          style: isDark ? "mapbox://styles/mapbox/dark-v11" : "mapbox://styles/mapbox/streets-v12",
          center: [location.longitude, location.latitude],
          zoom: 14,
          attributionControl: true,
        });
        m.on("error", () => {
          if (!cancelled) setMapFailed(true);
        });
        map = m;
        const markerColor = isDark ? "oklch(0.72 0.17 32)" : "oklch(0.53 0.18 32)";
        new mapboxgl.Marker({ color: markerColor }).setLngLat([location.longitude, location.latitude]).addTo(m);
      } catch {
        if (!cancelled) setMapFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      if (map?.remove) map.remove();
    };
  }, [open, location]);

  if (!location) return null;

  const mapboxUrl = `https://www.mapbox.com/search/${encodeURIComponent(location.name)}/${location.longitude},${location.latitude}`;
  const displayAddress =
    (location.address as { full_address?: string } | null)?.full_address ??
    `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl gap-0 overflow-hidden p-0 sm:max-w-2xl max-sm:h-[100dvh] max-sm:max-w-none max-sm:rounded-none">
        <DialogHeader className="border-b border-foreground/10 px-4 py-3 sm:px-5">
          <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
            <MapPin className="size-4 text-primary" />
            <span className="truncate">{location.name}</span>
          </DialogTitle>
        </DialogHeader>
        {mapFailed ? (
          <div className="flex h-[400px] w-full flex-col items-center justify-center bg-muted p-6 text-center max-sm:h-[55dvh]" role="region" aria-label="Location details fallback">
            <MapPin className="size-8 text-muted-foreground/60" />
            <p className="mt-2 text-sm font-semibold">{location.name}</p>
            <p className="mt-1 text-xs text-muted-foreground">{displayAddress}</p>
            <p className="mt-3 text-xs text-muted-foreground/80">Interactive map preview unavailable</p>
          </div>
        ) : (
          <div ref={containerRef} className="h-[400px] w-full bg-muted max-sm:h-[55dvh]" aria-label="Location map" />
        )}
        <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
          <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{displayAddress}</p>
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
