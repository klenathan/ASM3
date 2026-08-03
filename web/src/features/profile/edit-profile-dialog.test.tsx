import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EditProfileDialog, type AvatarChangeAction } from "./edit-profile-dialog";
import type { UpdateProfileInput } from "./api";

type SaveFn = (input: UpdateProfileInput, avatar: AvatarChangeAction) => void;

function setup({
  avatarMediaId = null,
  onSave = vi.fn(),
}: {
  avatarMediaId?: string | null;
  onSave?: ReturnType<typeof vi.fn>;
} = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ mediaId: avatarMediaId, url: "https://cdn.test/avatar.png" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    ),
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return {
    onSave,
    user: userEvent.setup(),
    ...render(
      <QueryClientProvider client={client}>
        <EditProfileDialog
          open
          onOpenChange={vi.fn()}
          initialDisplayName="Nadia Tran"
          initialBio="Hi"
          initialAvatarMediaId={avatarMediaId}
          onSave={onSave as unknown as SaveFn}
          isSaving={false}
          error={null}
        />
      </QueryClientProvider>,
    ),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("EditProfileDialog avatar", () => {
  it("submits a keep action when the avatar is unchanged", async () => {
    const { user, onSave } = setup({ avatarMediaId: "some-id" });
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    const avatar = onSave.mock.calls[0]?.[1];
    expect(avatar).toEqual({ type: "keep" });
  });

  it("submits a remove action when the avatar is removed", async () => {
    const { user, onSave } = setup({ avatarMediaId: "some-id" });
    await user.click(await screen.findByRole("button", { name: /remove/i }));
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    const avatar = onSave.mock.calls[0]?.[1];
    expect(avatar).toEqual({ type: "remove" });
  });

  it("submits an upload action with the selected file", async () => {
    const { user, onSave } = setup({ avatarMediaId: null });
    const file = new File(["data"], "avatar.png", { type: "image/png" });
    const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]');
    expect(fileInput).not.toBeNull();
    await user.upload(fileInput as HTMLInputElement, file);
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    const avatar = onSave.mock.calls[0]?.[1];
    expect(avatar).toEqual({ type: "upload", file });
  });

  it("rejects an unsupported file type", async () => {
    const { user, onSave } = setup({ avatarMediaId: null });
    const file = new File(["data"], "avatar.gif", { type: "image/gif" });
    const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    fireEvent.change(fileInput, { target: { files: [file] } });
    expect(
      await screen.findByText(/use a png/i, { selector: '[role="alert"]' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    expect(onSave).not.toHaveBeenCalled();
  });
});
