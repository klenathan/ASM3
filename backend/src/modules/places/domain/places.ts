export interface PlaceSuggestion {
  readonly mapboxId: string;
  readonly name: string;
  readonly placeType: string | null;
  readonly address: string | null;
  readonly fullAddress: string | null;
  readonly language?: string;
}

export interface PlaceDetails {
  readonly mapboxId: string;
  readonly name: string;
  readonly placeType: string | null;
  readonly latitude: number;
  readonly longitude: number;
  readonly address: Record<string, unknown> | null;
  readonly meta: Record<string, unknown> | null;
}

export interface ReverseResult {
  readonly latitude: number;
  readonly longitude: number;
  readonly address: Record<string, unknown> | null;
  readonly name: string | null;
}
