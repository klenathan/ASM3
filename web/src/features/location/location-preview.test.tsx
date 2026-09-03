import { render, screen, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LocationPreview } from "./location-preview";
import type { PickedLocation } from "./types";

let mockDragEndHandler: (() => Promise<void>) | undefined;
let mockMapErrorHandler: (() => void) | undefined;
const mockMarker = {
  setLngLat: vi.fn().mockReturnThis(),
  addTo: vi.fn().mockReturnThis(),
  getLngLat: vi.fn(() => ({ lat: -37.8085, lng: 144.9635 })),
  on: vi.fn((event: string, handler: () => Promise<void>) => {
    if (event === "dragend") mockDragEndHandler = handler;
  }),
};

const mockMap = {
  remove: vi.fn(),
  on: vi.fn((event: string, handler: () => void) => {
    if (event === "error") mockMapErrorHandler = handler;
  }),
};

vi.mock("mapbox-gl", () => ({
  default: {
    accessToken: "",
    Map: vi.fn(function () {
      return mockMap;
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

function setMapboxToken(token?: string) {
  if (token) {
    (import.meta.env as Record<string, string>).VITE_MAPBOX_PUBLIC_TOKEN = token;
    return;
  }
  delete (import.meta.env as Record<string, string | undefined>).VITE_MAPBOX_PUBLIC_TOKEN;
}

describe("LocationPreview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDragEndHandler = undefined;
    mockMapErrorHandler = undefined;
    vi.unstubAllEnvs();
    setMapboxToken();
  });

  it("renders fallback when Mapbox public token is missing", async () => {
    render(<LocationPreview location={testLocation} onUpdate={vi.fn()} />);

    expect(await screen.findByRole("region", { name: /location details fallback/i })).toBeInTheDocument();
    expect(screen.getByText("RMIT Building 80")).toBeInTheDocument();
    expect(screen.getByText("445 Swanston St, Melbourne VIC")).toBeInTheDocument();
    expect(screen.getByText("Map preview unavailable (drag fine-tune disabled)")).toBeInTheDocument();
  });

  it("falls back to formatted coordinates if full_address is absent", async () => {
    const locWithoutAddress: PickedLocation = {
      ...testLocation,
      address: null,
    };
    render(<LocationPreview location={locWithoutAddress} onUpdate={vi.fn()} />);

    await screen.findByRole("region", { name: /location details fallback/i });
    expect(screen.getByText("-37.80800, 144.96300")).toBeInTheDocument();
  });

  it("updates coordinates and falls back to coordinate label on reverse-geocode failure", async () => {
    vi.stubEnv("VITE_MAPBOX_PUBLIC_TOKEN", "pk.test");
    setMapboxToken("pk.test");
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

    setMapboxToken();
    vi.unstubAllEnvs();
  });

  it("shows the recovery state when Mapbox emits a runtime error", async () => {
    vi.stubEnv("VITE_MAPBOX_PUBLIC_TOKEN", "pk.test");
    setMapboxToken("pk.test");

    render(<LocationPreview location={testLocation} onUpdate={vi.fn()} />);

    await vi.waitFor(() => expect(mockMapErrorHandler).toBeTypeOf("function"));
    act(() => mockMapErrorHandler?.());

    expect(await screen.findByRole("region", { name: /location details fallback/i })).toBeInTheDocument();
    expect(screen.queryByText("Drag the pin to fine-tune.")).not.toBeInTheDocument();
    setMapboxToken();
    vi.unstubAllEnvs();
  });
});
