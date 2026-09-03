import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LocationPill } from "./location-pill";
import type { ThreadLocation } from "./types";

const testLocation: ThreadLocation = {
  mapboxId: "mbx.1",
  name: "RMIT Building 80",
  placeType: "poi",
  latitude: -37.808,
  longitude: 144.963,
  address: null,
};

describe("LocationPill", () => {
  it("renders location name with icon and accessible label", () => {
    render(<LocationPill location={testLocation} onClick={vi.fn()} />);

    expect(screen.getByText("RMIT Building 80")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View location: RMIT Building 80" })).toBeInTheDocument();
  });

  it("calls onClick when clicked or activated", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<LocationPill location={testLocation} onClick={onClick} />);

    const button = screen.getByRole("button", { name: "View location: RMIT Building 80" });
    await user.click(button);

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
