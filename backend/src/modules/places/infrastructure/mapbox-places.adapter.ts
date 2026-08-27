import { ApplicationError } from "../../../shared/domain/errors";
import type { PlaceDetails, PlaceSuggestion, ReverseResult } from "../domain/places";
import type { PlacesPort } from "../application/places.port";

interface MapboxSuggestResponse {
  suggestions: Array<{
    mapbox_id: string;
    name: string;
    feature_type?: string;
    place_formatted?: string;
    full_address?: string;
    address?: string;
  }>;
}

interface MapboxRetrieveResponse {
  features: Array<{
    properties: {
      mapbox_id: string;
      name: string;
      feature_type?: string;
      full_address?: string;
      address?: string;
      coordinates?: { latitude: number; longitude: number };
      place_formatted?: string;
      context?: unknown;
    };
    geometry: { coordinates: [number, number] };
    properties_full?: unknown;
  }>;
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class MapboxPlacesAdapter implements PlacesPort {
  private readonly secretToken: string;
  private readonly suggestCache = new Map<string, CacheEntry<readonly PlaceSuggestion[]>>();
  private readonly retrieveCache = new Map<string, CacheEntry<PlaceDetails>>();
  private readonly rateLimit = new Map<string, number[]>();
  private readonly suggestNegativeCache = new Map<string, CacheEntry<readonly PlaceSuggestion[]>>();

  constructor(secretToken: string) {
    this.secretToken = secretToken;
  }

  async search(query: string, proximity: string | null, sessionToken: string | null): Promise<readonly PlaceSuggestion[]> {
    const cacheKey = `${query}|${proximity ?? ""}`;
    const now = Date.now();
    const cached = this.suggestCache.get(cacheKey);
    if (cached && cached.expiresAt > now) return cached.value;
    const neg = this.suggestNegativeCache.get(cacheKey);
    if (neg && neg.expiresAt > now) return neg.value;

    if (query.trim().length < 2) return [];

    const params = new URLSearchParams({
      q: query,
      access_token: this.secretToken,
      language: "en",
      country: "au,vn",
      types: "poi,place,address,locality,neighborhood",
      limit: "5",
    });
    if (proximity) params.set("proximity", proximity);
    if (sessionToken) params.set("session_token", sessionToken);

    const url = `https://api.mapbox.com/search/searchbox/v1/suggest?${params.toString()}`;

    let json: MapboxSuggestResponse;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (res.status === 401 || res.status === 403) throw new ApplicationError("PLACES_UNAVAILABLE", "Mapbox authentication failed");
      if (!res.ok) throw new ApplicationError("PLACES_UNAVAILABLE", "Mapbox search unavailable");
      json = (await res.json()) as MapboxSuggestResponse;
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      throw new ApplicationError("PLACES_UNAVAILABLE", "Mapbox search unavailable");
    }

    const suggestions: PlaceSuggestion[] = (json.suggestions ?? []).map((s) => ({
      mapboxId: s.mapbox_id,
      name: s.name,
      placeType: s.feature_type ?? null,
      address: s.place_formatted ?? s.full_address ?? s.address ?? null,
      fullAddress: s.full_address ?? null,
    }));

    if (suggestions.length === 0) {
      this.suggestNegativeCache.set(cacheKey, { value: [], expiresAt: now + 5 * 60 * 1000 });
    } else {
      this.suggestCache.set(cacheKey, { value: suggestions, expiresAt: now + 60 * 1000 });
    }
    return suggestions;
  }

  async retrieve(mapboxId: string, sessionToken: string | null): Promise<PlaceDetails> {
    const now = Date.now();
    const cached = this.retrieveCache.get(mapboxId);
    if (cached && cached.expiresAt > now) return cached.value;

    const params = new URLSearchParams({ access_token: this.secretToken });
    if (sessionToken) params.set("session_token", sessionToken);

    const url = `https://api.mapbox.com/search/searchbox/v1/retrieve/${encodeURIComponent(mapboxId)}?${params.toString()}`;

    let json: MapboxRetrieveResponse;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (res.status === 404) throw new ApplicationError("LOCATION_NOT_FOUND", "Place not found");
      if (res.status === 401 || res.status === 403) throw new ApplicationError("PLACES_UNAVAILABLE", "Mapbox authentication failed");
      if (!res.ok) throw new ApplicationError("PLACES_UNAVAILABLE", "Mapbox retrieve unavailable");
      json = (await res.json()) as MapboxRetrieveResponse;
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      throw new ApplicationError("PLACES_UNAVAILABLE", "Mapbox retrieve unavailable");
    }

    const feature = json.features?.[0];
    if (!feature) throw new ApplicationError("LOCATION_NOT_FOUND", "Place not found");

    const lng = feature.geometry.coordinates[0];
    const lat = feature.geometry.coordinates[1];
    const props = feature.properties;

    if (typeof lat !== "number" || typeof lng !== "number") throw new ApplicationError("LOCATION_NOT_FOUND", "Place has no coordinates");

    const details: PlaceDetails = {
      mapboxId: props.mapbox_id,
      name: props.name,
      placeType: props.feature_type ?? null,
      latitude: lat,
      longitude: lng,
      address: props.full_address ? { full_address: props.full_address } : props.address ? { address: props.address } : null,
      meta: (feature.properties_full as Record<string, unknown> | null) ?? null,
    };

    this.retrieveCache.set(mapboxId, { value: details, expiresAt: now + 60 * 1000 });
    return details;
  }

  async reverse(latitude: number, longitude: number): Promise<ReverseResult> {
    const params = new URLSearchParams({
      access_token: this.secretToken,
      longitude: String(longitude),
      latitude: String(latitude),
    });
    const url = `https://api.mapbox.com/search/searchbox/v1/reverse?${params.toString()}`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new ApplicationError("PLACES_UNAVAILABLE", "Mapbox reverse unavailable");
      const json = (await res.json()) as { features?: Array<{ properties: { name?: string; full_address?: string; coordinates: { latitude: number; longitude: number } }; geometry: { coordinates: [number, number] } }> };
      const feat = json.features?.[0];
      if (!feat) return { latitude, longitude, address: null, name: null };
      return {
        latitude,
        longitude,
        address: feat.properties.full_address ? { full_address: feat.properties.full_address } : null,
        name: feat.properties.name ?? null,
      };
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      throw new ApplicationError("PLACES_UNAVAILABLE", "Mapbox reverse unavailable");
    }
  }

  checkRateLimit(userId: string): boolean {
    const now = Date.now();
    const windowMs = 60_000;
    const limit = 30;
    const timestamps = this.rateLimit.get(userId) ?? [];
    const recent = timestamps.filter((t) => now - t < windowMs);
    if (recent.length >= limit) {
      this.rateLimit.set(userId, recent);
      return false;
    }
    recent.push(now);
    this.rateLimit.set(userId, recent);
    return true;
  }
}
