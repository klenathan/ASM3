import { useEffect, useState } from "react";
import { ExternalLink, MapPin } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { createLocationMap, isMapboxTokenConfigured } from "./mapbox-map";
import type { ThreadLocation } from "./types";

interface Props {
  readonly location: ThreadLocation | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

export function LocationModal({ location, open, onOpenChange }: Props) {
  const [mapContainer, setMapContainer] = useState<HTMLDivElement | null>(null);
  const [mapFailed, setMapFailed] = useState(false);

  useEffect(() => {
    if (open && location) setMapFailed(false);
  }, [open, location]);

  useEffect(() => {
    let cancelled = false;
    if (!open || !location || mapFailed) return;
    if (!isMapboxTokenConfigured()) {
      setMapFailed(true);
      return;
    }
    if (!mapContainer) return;
    let removeMap: (() => void) | undefined;
    (async () => {
      try {
        const handle = await createLocationMap({
          container: mapContainer,
          coordinates: [location.longitude, location.latitude],
          zoom: 14,
          onError: () => {
            if (!cancelled) setMapFailed(true);
          },
        });
        if (!handle) {
          if (!cancelled) setMapFailed(true);
          return;
        }
        if (cancelled) {
          handle.map.remove();
          return;
        }
        removeMap = () => handle.map.remove();
      } catch {
        if (!cancelled) setMapFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      removeMap?.();
    };
  }, [open, location, mapContainer, mapFailed]);

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
          <div ref={setMapContainer} className="h-[400px] w-full bg-muted max-sm:h-[55dvh]" aria-label="Location map" />
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
