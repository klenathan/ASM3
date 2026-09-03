type Coordinates = [number, number];

interface MapboxMap {
  remove: () => void;
  on: (event: "error", listener: () => void) => void;
}

export interface MapboxMarker {
  setLngLat: (coordinates: Coordinates) => MapboxMarker;
  addTo: (map: MapboxMap) => MapboxMarker;
  on: (event: "dragend", listener: () => void) => void;
  getLngLat: () => { lat: number; lng: number };
}

interface MapboxModule {
  accessToken: string;
  Map: new (options: unknown) => MapboxMap;
  Marker: new (options: unknown) => MapboxMarker;
}

interface CreateLocationMapOptions {
  readonly container: HTMLDivElement;
  readonly coordinates: Coordinates;
  readonly zoom: number;
  readonly draggable?: boolean;
  readonly onError: () => void;
}

export interface LocationMapHandle {
  readonly map: MapboxMap;
  readonly marker: MapboxMarker;
}

export function isMapboxTokenConfigured() {
  return Boolean(import.meta.env.VITE_MAPBOX_PUBLIC_TOKEN);
}

export async function createLocationMap({
  container,
  coordinates,
  zoom,
  draggable = false,
  onError,
}: CreateLocationMapOptions): Promise<LocationMapHandle | null> {
  const token = import.meta.env.VITE_MAPBOX_PUBLIC_TOKEN as string | undefined;
  if (!token) return null;

  const imported = await import("mapbox-gl");
  const mapboxgl = ((imported as unknown as { default?: MapboxModule }).default ?? imported) as MapboxModule;
  mapboxgl.accessToken = token;

  const isDark = document.documentElement.classList.contains("dark");
  const map = new mapboxgl.Map({
    container,
    style: isDark ? "mapbox://styles/mapbox/dark-v11" : "mapbox://styles/mapbox/streets-v12",
    center: coordinates,
    zoom,
    attributionControl: true,
  });
  map.on("error", onError);

  const markerColor = isDark ? "oklch(0.72 0.17 32)" : "oklch(0.53 0.18 32)";
  const marker = new mapboxgl.Marker({ draggable, color: markerColor }).setLngLat(coordinates).addTo(map);

  return { map, marker };
}
