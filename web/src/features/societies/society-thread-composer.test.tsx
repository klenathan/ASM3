import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SocietyThreadComposer } from "./society-thread-composer";
import type { CreateThreadDraft } from "./types";

const baseProps = {
  societyName: "Cloud Computing Club",
  displayName: "Alex Student",
  isSubmitting: false,
  onCreate: vi.fn<(input: CreateThreadDraft) => Promise<void>>(),
};

describe("SocietyThreadComposer", () => {
  it("gates posting until the user joins the society", () => {
    render(<SocietyThreadComposer {...baseProps} access="guest" />);

    expect(
      screen.getByRole("heading", { name: "Join Cloud Computing Club to post" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /start a thread/i })).not.toBeInTheDocument();
  });

  it("rejects unsupported attachment types before publishing", async () => {
    const user = userEvent.setup();
    render(<SocietyThreadComposer {...baseProps} access="member" />);

    await user.click(screen.getByRole("button", { name: /start a thread in cloud computing club/i }));
    fireEvent.change(screen.getByLabelText("Choose thread images"), {
      target: {
        files: [new File(["document"], "notes.pdf", { type: "application/pdf" })],
      },
    });

    expect(screen.getByRole("alert")).toHaveTextContent("Choose JPG, PNG, GIF, or WebP images only.");
    expect(screen.queryByText("notes.pdf")).not.toBeInTheDocument();
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
    const image = new File(["image"], "study-group.png", { type: "image/png" });
    await user.upload(screen.getByLabelText("Choose thread images"), image);
    expect(screen.getByText("study-group.png")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Publish thread" }));

    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith({
        title: "Study group this Friday",
        body: "Meet outside Building 80 at 4 pm.",
        images: [image],
      }),
    );
    expect(
      await screen.findByText("Thread published. It is now first in the society feed."),
    ).toBeInTheDocument();
  });
});
