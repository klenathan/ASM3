import { render, screen } from "@testing-library/react";
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

describe("LocationModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when location is null or open is false", () => {
    const { container } = render(<LocationModal location={null} open={true} onOpenChange={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();

    const { container: closedContainer } = render(
      <LocationModal location={testLocation} open={false} onOpenChange={vi.fn()} />,
    );
    expect(closedContainer).toBeEmptyDOMElement();
  });

  it("renders location details and fallback when token is absent", () => {
    render(<LocationModal location={testLocation} open={true} onOpenChange={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "RMIT Building 80" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /location details fallback/i })).toBeInTheDocument();
    expect(screen.getByText("Interactive map preview unavailable")).toBeInTheDocument();
    expect(screen.getAllByText("445 Swanston St, Melbourne VIC")).toHaveLength(2);

    const mapboxLink = screen.getByRole("link", { name: /open in mapbox/i });
    expect(mapboxLink).toHaveAttribute("href", expect.stringContaining("https://www.mapbox.com/search/"));
  });

  it("formats coordinates if address is missing", () => {
    const locWithoutAddress: ThreadLocation = {
      ...testLocation,
      address: null,
    };
    render(<LocationModal location={locWithoutAddress} open={true} onOpenChange={vi.fn()} />);

    expect(screen.getAllByText("-37.80800, 144.96300")).toHaveLength(2);
  });

  it("displays fallback when mapbox emits an async error and resets on reopen", async () => {
    let errorHandler: (() => void) | undefined;
    const mockMap = {
      remove: vi.fn(),
      on: vi.fn((event: string, listener: () => void) => {
        if (event === "error") {
          errorHandler = listener;
        }
      }),
    };

    vi.stubEnv("VITE_MAPBOX_PUBLIC_TOKEN", "pk.test");
    vi.doMock("mapbox-gl", () => ({
      default: {
        accessToken: "",
        Map: vi.fn(() => mockMap),
        Marker: vi.fn(() => ({
          setLngLat: vi.fn().mockReturnThis(),
          addTo: vi.fn().mockReturnThis(),
        })),
      },
    }));

    const { rerender } = render(<LocationModal location={testLocation} open={true} onOpenChange={vi.fn()} />);

    // When mapbox emits an async error, fallback should show
    errorHandler?.();

    // Reopening modal resets mapFailed
    rerender(<LocationModal location={testLocation} open={false} onOpenChange={vi.fn()} />);
    rerender(<LocationModal location={testLocation} open={true} onOpenChange={vi.fn()} />);

    vi.unstubAllEnvs();
    vi.doUnmock("mapbox-gl");
  });
});
