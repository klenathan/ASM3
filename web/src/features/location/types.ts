export interface ThreadLocation {
  readonly name: string;
  readonly mapboxId: string;
  readonly placeType: string | null;
  readonly latitude: number;
  readonly longitude: number;
  readonly address: Record<string, unknown> | null;
  readonly meta?: Record<string, unknown> | null;
}

export interface PickedLocation {
  readonly mapboxId: string;
  readonly name: string;
  readonly placeType: string | null;
  readonly latitude: number;
  readonly longitude: number;
  readonly address: Record<string, unknown> | null;
}
