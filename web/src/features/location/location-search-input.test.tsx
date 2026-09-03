import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LocationSearchInput } from "./location-search-input";
import * as api from "./api";

vi.mock("./api", () => ({
  searchPlaces: vi.fn(),
  retrievePlace: vi.fn(),
}));

describe("LocationSearchInput", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not request browser geolocation on mount", () => {
    const getCurrentPosition = vi.fn();
    Object.defineProperty(globalThis.navigator, "geolocation", {
      value: { getCurrentPosition },
      configurable: true,
      writable: true,
    });

    render(<LocationSearchInput onPick={vi.fn()} picked={null} />);

    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it("requests browser geolocation only after explicit user click", async () => {
    const user = userEvent.setup();
    const getCurrentPosition = vi.fn((success: PositionCallback) => {
      success({
        coords: {
          longitude: 144.9631,
          latitude: -37.8136,
          accuracy: 10,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
          toJSON: () => ({}),
        },
        timestamp: Date.now(),
        toJSON: () => ({}),
      });
    });
    Object.defineProperty(globalThis.navigator, "geolocation", {
      value: { getCurrentPosition },
      configurable: true,
      writable: true,
    });

    render(<LocationSearchInput onPick={vi.fn()} picked={null} />);

    const locateButton = screen.getByRole("button", { name: /use current location/i });
    await user.click(locateButton);

    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.getByText("Nearby location bias active")).toBeInTheDocument();
    });
  });

  it("renders loading and empty states for place search", async () => {
    const user = userEvent.setup();
    vi.mocked(api.searchPlaces).mockResolvedValue({ suggestions: [] });

    render(<LocationSearchInput onPick={vi.fn()} picked={null} />);

    const input = screen.getByLabelText("Search location");
    await user.type(input, "RMIT");

    await waitFor(() => {
      expect(api.searchPlaces).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(screen.getByText("No places found.")).toBeInTheDocument();
    });
  });

  it("renders dismissible error banner when search fails", async () => {
    const user = userEvent.setup();
    vi.mocked(api.searchPlaces).mockRejectedValue(new Error("Network error"));

    render(<LocationSearchInput onPick={vi.fn()} picked={null} />);

    const input = screen.getByLabelText("Search location");
    await user.type(input, "Building 80");

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Search unavailable — post without location or retry.");
    });

    const dismissBtn = screen.getByRole("button", { name: "Dismiss" });
    await user.click(dismissBtn);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("retrieves place details on selection and triggers onPick", async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    vi.mocked(api.searchPlaces).mockResolvedValue({
      suggestions: [
        {
          mapboxId: "mbx.1",
          name: "RMIT Building 80",
          placeType: "poi",
          address: "445 Swanston St",
        },
      ],
    });
    vi.mocked(api.retrievePlace).mockResolvedValue({
      mapboxId: "mbx.1",
      name: "RMIT Building 80",
      placeType: "poi",
      latitude: -37.808,
      longitude: 144.963,
      address: { street: "445 Swanston St" },
    });

    render(<LocationSearchInput onPick={onPick} picked={null} />);

    const input = screen.getByLabelText("Search location");
    await user.type(input, "Building 80");

    const suggestion = await screen.findByText("RMIT Building 80");
    await user.click(suggestion);

    await waitFor(() => {
      expect(api.retrievePlace).toHaveBeenCalledWith("mbx.1", expect.any(String));
      expect(onPick).toHaveBeenCalledWith({
        mapboxId: "mbx.1",
        name: "RMIT Building 80",
        placeType: "poi",
        latitude: -37.808,
        longitude: 144.963,
        address: { street: "445 Swanston St" },
      });
    });
  });

  it("handles place retrieval error gracefully", async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    vi.mocked(api.searchPlaces).mockResolvedValue({
      suggestions: [
        {
          mapboxId: "mbx.fail",
          name: "Broken Place",
          placeType: "poi",
          address: null,
        },
      ],
    });
    vi.mocked(api.retrievePlace).mockRejectedValue(new Error("Retrieve failed"));

    render(<LocationSearchInput onPick={onPick} picked={null} />);

    const input = screen.getByLabelText("Search location");
    await user.type(input, "Broken Place");

    const suggestion = await screen.findByText("Broken Place");
    await user.click(suggestion);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Could not retrieve place details");
    });
    expect(onPick).not.toHaveBeenCalled();
  });

  it("renders picked location with remove button", async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    const picked = {
      mapboxId: "mbx.1",
      name: "RMIT Building 80",
      placeType: "poi",
      latitude: -37.808,
      longitude: 144.963,
      address: null,
    };

    render(<LocationSearchInput onPick={vi.fn()} onClear={onClear} picked={picked} />);

    expect(screen.getByText("RMIT Building 80")).toBeInTheDocument();
    const removeBtn = screen.getByRole("button", { name: "Remove location" });
    await user.click(removeBtn);
    expect(onClear).toHaveBeenCalled();
  });
});
