import { render, screen, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LocationPreview } from "./location-preview";
import type { PickedLocation } from "./types";

let mockDragEndHandler: (() => Promise<void>) | undefined;
const mockMarker = {
  setLngLat: vi.fn().mockReturnThis(),
  addTo: vi.fn().mockReturnThis(),
  getLngLat: vi.fn(() => ({ lat: -37.8085, lng: 144.9635 })),
  on: vi.fn((event: string, handler: () => Promise<void>) => {
    if (event === "dragend") mockDragEndHandler = handler;
  }),
};

vi.mock("mapbox-gl", () => ({
  default: {
    accessToken: "",
    Map: vi.fn(function () {
      return { remove: vi.fn() };
    }),
    Marker: vi.fn(function () {
      return mockMarker;
    }),
  },
}));
const testLocation: PickedLocation = {
  mapboxId: "mbx.1",
  name: "RMIT Building 80",
  placeType: "poi",
  latitude: -37.808,
  longitude: 144.963,
  address: { full_address: "445 Swanston St, Melbourne VIC" },
};

describe("LocationPreview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDragEndHandler = undefined;
  });

  it("renders fallback when Mapbox public token is missing", () => {
    render(<LocationPreview location={testLocation} onUpdate={vi.fn()} />);

    expect(screen.getByRole("region", { name: /location details fallback/i })).toBeInTheDocument();
    expect(screen.getByText("RMIT Building 80")).toBeInTheDocument();
    expect(screen.getByText("445 Swanston St, Melbourne VIC")).toBeInTheDocument();
    expect(screen.getByText("Map preview unavailable (drag fine-tune disabled)")).toBeInTheDocument();
  });

  it("falls back to formatted coordinates if full_address is absent", () => {
    const locWithoutAddress: PickedLocation = {
      ...testLocation,
      address: null,
    };
    render(<LocationPreview location={locWithoutAddress} onUpdate={vi.fn()} />);

    expect(screen.getByText("-37.80800, 144.96300")).toBeInTheDocument();
  });

  it("updates coordinates and falls back to coordinate label on reverse-geocode failure", async () => {
    vi.stubEnv("VITE_MAPBOX_PUBLIC_TOKEN", "pk.test");
    (import.meta.env as Record<string, string>).VITE_MAPBOX_PUBLIC_TOKEN = "pk.test";
    const onUpdate = vi.fn();
    render(<LocationPreview location={testLocation} onUpdate={onUpdate} />);

    await vi.waitFor(() => expect(mockDragEndHandler).toBeDefined());
    await act(async () => {
      await mockDragEndHandler?.();
    });

    expect(onUpdate).toHaveBeenCalledWith({
      ...testLocation,
      latitude: -37.8085,
      longitude: 144.9635,
      address: null,
    });
    expect(screen.getByText("-37.80850, 144.96350")).toBeInTheDocument();

    delete (import.meta.env as Record<string, string | undefined>).VITE_MAPBOX_PUBLIC_TOKEN;
    vi.unstubAllEnvs();
  });
});
