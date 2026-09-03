import { useEffect, useRef, useState } from "react";
import { reverseGeocode } from "./api";
import type { PickedLocation } from "./types";

interface Props {
  readonly location: PickedLocation;
  readonly onUpdate: (loc: PickedLocation) => void;
}

export function LocationPreview({ location, onUpdate }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<unknown>(null);
  const markerRef = useRef<unknown>(null);
  const [addressText, setAddressText] = useState<string | null>(null);
  const [mapFailed, setMapFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const token = import.meta.env.VITE_MAPBOX_PUBLIC_TOKEN as string | undefined;
    if (!token) {
      setMapFailed(true);
      return;
    }
    if (!containerRef.current) return;
    let map: unknown;
    (async () => {
      try {
        // Dynamic import mapbox-gl to avoid heavy WebGL bundle on initial load and handle missing WebGL
        const mod = await import("mapbox-gl");
        const mapboxgl = (mod as unknown as { default: { accessToken: string; Map: new (opts: unknown) => { remove: () => void }; Marker: new (opts: unknown) => { setLngLat: (coords: [number, number]) => { addTo: (map: unknown) => { on: (event: string, handler: () => void) => void; getLngLat: () => { lat: number; lng: number } } } } } }).default;
        mapboxgl.accessToken = token;
        const isDark = document.documentElement.classList.contains("dark");
        const m = new mapboxgl.Map({
          container: containerRef.current!,
          style: isDark ? "mapbox://styles/mapbox/dark-v11" : "mapbox://styles/mapbox/streets-v12",
          center: [location.longitude, location.latitude],
          zoom: 15,
          attributionControl: true,
        });
        map = m;
        mapRef.current = m;
        const markerColor = isDark ? "oklch(0.72 0.17 32)" : "oklch(0.53 0.18 32)";
        const marker = new mapboxgl.Marker({ draggable: true, color: markerColor })
          .setLngLat([location.longitude, location.latitude])
          .addTo(m);
        markerRef.current = marker;
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
            if (!cancelled) onUpdate({ ...location, latitude: lat, longitude: lng });
          }
        });
      } catch {
        if (!cancelled) setMapFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      const m = map as { remove?: () => void } | undefined;
      if (m?.remove) m.remove();
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
