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

  useEffect(() => {
    let cancelled = false;
    const token = import.meta.env.VITE_MAPBOX_PUBLIC_TOKEN as string | undefined;
    if (!token || !containerRef.current) return;
    let map: unknown;
    (async () => {
      try {
        const mod = await import("mapbox-gl");
        const mapboxgl = (mod as unknown as { default: typeof import("mapbox-gl").default }).default ?? (mod as unknown as typeof import("mapbox-gl").default);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (mapboxgl as any).accessToken = token;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const m = new (mapboxgl as any).Map({
          container: containerRef.current!,
          style: document.documentElement.classList.contains("dark") ? "mapbox://styles/mapbox/dark-v11" : "mapbox://styles/mapbox/streets-v12",
          center: [location.longitude, location.latitude],
          zoom: 15,
          attributionControl: false,
        });
        map = m;
        mapRef.current = m;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const marker = new (mapboxgl as any).Marker({ draggable: true, color: "oklch(0.53 0.18 32)" })
          .setLngLat([location.longitude, location.latitude])
          .addTo(m);
        markerRef.current = marker;
        marker.on("dragend", async () => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const lngLat = (marker as any).getLngLat();
          const lat = lngLat.lat as number;
          const lng = lngLat.lng as number;
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
        // map load failed — leave container empty, fallback to text
      }
    })();
    return () => {
      cancelled = true;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const m = map as any;
      if (m?.remove) m.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.mapboxId]);

  return (
    <div className="space-y-2">
      <div ref={containerRef} className="h-[200px] w-full border border-foreground/15 bg-muted" aria-label="Location preview map" />
      {addressText && <p className="text-xs text-muted-foreground">{addressText}</p>}
      <p className="text-xs text-muted-foreground">Drag the pin to fine-tune.</p>
    </div>
  );
}
