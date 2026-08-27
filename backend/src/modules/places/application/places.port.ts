import type { PlaceDetails, PlaceSuggestion, ReverseResult } from "../domain/places";

export interface PlacesPort {
  search(query: string, proximity: string | null, sessionToken: string | null): Promise<readonly PlaceSuggestion[]>;
  retrieve(mapboxId: string, sessionToken: string | null): Promise<PlaceDetails>;
  reverse(latitude: number, longitude: number): Promise<ReverseResult>;
}
