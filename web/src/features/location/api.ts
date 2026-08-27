import { request } from "../../lib/http";

export interface PlaceSuggestion {
  readonly mapboxId: string;
  readonly name: string;
  readonly placeType: string | null;
  readonly address: string | null;
  readonly fullAddress?: string | null;
}

export interface PlaceDetails {
  readonly mapboxId: string;
  readonly name: string;
  readonly placeType: string | null;
  readonly latitude: number;
  readonly longitude: number;
  readonly address: Record<string, unknown> | null;
  readonly meta?: Record<string, unknown> | null;
}

export interface ReverseResult {
  readonly latitude: number;
  readonly longitude: number;
  readonly address: Record<string, unknown> | null;
  readonly name: string | null;
}

export function searchPlaces(query: string, proximity: string | null, sessionToken: string | null): Promise<{ suggestions: PlaceSuggestion[] }> {
  const params = new URLSearchParams({ q: query });
  if (proximity) params.set("proximity", proximity);
  if (sessionToken) params.set("session_token", sessionToken);
  return request<{ suggestions: PlaceSuggestion[] }>(`/api/v1/places/search?${params.toString()}`);
}

export function retrievePlace(mapboxId: string, sessionToken: string | null): Promise<PlaceDetails> {
  const params = sessionToken ? `?session_token=${encodeURIComponent(sessionToken)}` : "";
  return request<PlaceDetails>(`/api/v1/places/retrieve/${encodeURIComponent(mapboxId)}${params}`);
}

export function reverseGeocode(lat: number, lng: number): Promise<ReverseResult> {
  return request<ReverseResult>(`/api/v1/places/reverse?lat=${lat}&lng=${lng}`);
}
