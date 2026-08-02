import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SocietyThreadComposer } from "./society-thread-composer";

const baseProps = {
  societyName: "Cloud Computing Club",
  displayName: "Alex Student",
  isSubmitting: false,
  onCreate: vi.fn<() => Promise<void>>(),
};

describe("SocietyThreadComposer", () => {
  it("gates posting until the user joins the society", () => {
    render(<SocietyThreadComposer {...baseProps} access="guest" />);

    expect(
      screen.getByRole("heading", { name: "Join Cloud Computing Club to post" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /start a thread/i })).not.toBeInTheDocument();
  });

  it("validates and publishes a thread for active members", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(
      <SocietyThreadComposer
        {...baseProps}
        access="member"
        onCreate={onCreate}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /start a thread in cloud computing club/i }),
    );
    await user.click(screen.getByRole("button", { name: "Publish thread" }));

    expect(screen.getByText("Add a clear thread title.")).toBeInTheDocument();
    expect(screen.getByText("Write something for the society.")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Thread title"), "  Study group this Friday  ");
    await user.type(
      screen.getByLabelText("Your post"),
      "  Meet outside Building 80 at 4 pm.  ",
    );
    await user.click(screen.getByRole("button", { name: "Publish thread" }));

    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith({
        title: "Study group this Friday",
        body: "Meet outside Building 80 at 4 pm.",
      }),
    );
    expect(
      await screen.findByText("Thread published. It is now first in the society feed."),
    ).toBeInTheDocument();
  });
});
