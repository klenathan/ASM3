import { useEffect, useRef, useState } from "react";
import { reverseGeocode } from "./api";
import { createLocationMap } from "./mapbox-map";
import type { MapboxMarker } from "./mapbox-map";
import type { PickedLocation } from "./types";

interface Props {
  readonly location: PickedLocation;
  readonly onUpdate: (loc: PickedLocation) => void;
}

export function LocationPreview({ location, onUpdate }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [addressText, setAddressText] = useState<string | null>(null);
  const [mapFailed, setMapFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setMapFailed(false);
    if (!containerRef.current) return;
    let removeMap: (() => void) | undefined;
    (async () => {
      try {
        const handle = await createLocationMap({
          container: containerRef.current!,
          coordinates: [location.longitude, location.latitude],
          zoom: 15,
          draggable: true,
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
        const marker: MapboxMarker = handle.marker;
        marker.on("dragend", async () => {
          const lngLat = marker.getLngLat();
          const lat = lngLat.lat;
          const lng = lngLat.lng;
          try {
            const rev = await reverseGeocode(lat, lng);
            if (cancelled) return;
            setAddressText((rev.address as unknown as { full_address?: string } | null)?.full_address ?? rev.name ?? null);
            onUpdate({ ...location, latitude: lat, longitude: lng, address: rev.address });
          } catch {
            if (!cancelled) {
              setAddressText(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
              onUpdate({ ...location, latitude: lat, longitude: lng, address: null });
            }
          }
        });
      } catch {
        if (!cancelled) setMapFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      removeMap?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.mapboxId]);

  const displayAddress =
    addressText ??
    (location.address as { full_address?: string } | null)?.full_address ??
    `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`;

  return (
    <div className="space-y-2">
      {mapFailed ? (
        <div className="flex h-[140px] w-full flex-col justify-center rounded-none border border-foreground/15 bg-muted p-4 text-xs text-muted-foreground" role="region" aria-label="Location details fallback">
          <p className="font-semibold text-foreground">{location.name}</p>
          <p className="mt-1">{displayAddress}</p>
          <p className="mt-2 text-muted-foreground/80">Map preview unavailable (drag fine-tune disabled)</p>
        </div>
      ) : (
        <div ref={containerRef} className="h-[200px] w-full border border-foreground/15 bg-muted" aria-label="Location preview map" />
      )}
      {!mapFailed && addressText && <p className="text-xs text-muted-foreground">{addressText}</p>}
      {!mapFailed && <p className="text-xs text-muted-foreground">Drag the pin to fine-tune.</p>}
    </div>
  );
}
