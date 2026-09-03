import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LocationPreview } from "./location-preview";
import type { PickedLocation } from "./types";

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
});
