import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LocationModal } from "./location-modal";
import type { ThreadLocation } from "./types";

const testLocation: ThreadLocation = {
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

const mapboxMock = vi.hoisted(() => {
  let errorHandler: (() => void) | undefined;
  const map = {
    remove: vi.fn(),
    on: vi.fn((event: string, listener: () => void) => {
      if (event === "error") errorHandler = listener;
    }),
  };
  return {
    map,
    getErrorHandler: () => errorHandler,
    reset: () => {
      errorHandler = undefined;
      map.remove.mockReset();
      map.on.mockClear();
    },
  };
});

vi.mock("mapbox-gl", () => ({
  default: {
    accessToken: "",
    Map: function MapboxMap() {
      return mapboxMock.map;
    },
    Marker: function MapboxMarker() {
      return {
        setLngLat: vi.fn().mockReturnThis(),
        addTo: vi.fn().mockReturnThis(),
      };
    },
  },
}));

describe("LocationModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    setMapboxToken();
    mapboxMock.reset();
  });

  it("renders nothing when location is null or open is false", () => {
    const { container } = render(<LocationModal location={null} open={true} onOpenChange={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();

    const { container: closedContainer } = render(
      <LocationModal location={testLocation} open={false} onOpenChange={vi.fn()} />,
    );
    expect(closedContainer).toBeEmptyDOMElement();
  });

  it("renders location details and fallback when token is absent", async () => {
    render(<LocationModal location={testLocation} open={true} onOpenChange={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "RMIT Building 80" })).toBeInTheDocument();
    expect(await screen.findByRole("region", { name: /location details fallback/i })).toBeInTheDocument();
    expect(screen.getByText("Interactive map preview unavailable")).toBeInTheDocument();
    expect(screen.getAllByText("445 Swanston St, Melbourne VIC")).toHaveLength(2);

    const mapboxLink = screen.getByRole("link", { name: /open in mapbox/i });
    expect(mapboxLink).toHaveAttribute("href", expect.stringContaining("https://www.mapbox.com/search/"));
  });

  it("formats coordinates if address is missing", async () => {
    const locWithoutAddress: ThreadLocation = {
      ...testLocation,
      address: null,
    };
    render(<LocationModal location={locWithoutAddress} open={true} onOpenChange={vi.fn()} />);

    await screen.findByRole("region", { name: /location details fallback/i });
    expect(screen.getAllByText("-37.80800, 144.96300")).toHaveLength(2);
  });

  it("displays fallback when mapbox emits an async error and resets on reopen", async () => {
    vi.stubEnv("VITE_MAPBOX_PUBLIC_TOKEN", "pk.test");
    setMapboxToken("pk.test");
    const { rerender } = render(<LocationModal location={testLocation} open={true} onOpenChange={vi.fn()} />);

    await waitFor(() => expect(mapboxMock.getErrorHandler()).toBeTypeOf("function"));
    act(() => mapboxMock.getErrorHandler()?.());
    expect(await screen.findByRole("region", { name: /location details fallback/i })).toBeInTheDocument();

    rerender(<LocationModal location={testLocation} open={false} onOpenChange={vi.fn()} />);
    rerender(<LocationModal location={testLocation} open={true} onOpenChange={vi.fn()} />);

    await waitFor(() => expect(screen.getByLabelText("Location map")).toBeInTheDocument());
    expect(screen.queryByRole("region", { name: /location details fallback/i })).not.toBeInTheDocument();
  });
});
