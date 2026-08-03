import { useEffect, useState } from "react";

import { Button } from "../../components/ui/button";
import { Spinner } from "../../components/ui/spinner";
import { Switch } from "../../components/ui/switch";
import { useAuth } from "../../features/auth/auth-context";
import { deleteMediaUpload, uploadAvatar } from "../../features/media/api";
import { ActivityFeed } from "../../features/profile/activity-feed";
import {
  EditProfileDialog,
  type AvatarChangeAction,
} from "../../features/profile/edit-profile-dialog";
import { PrivateProfileState } from "../../features/profile/private-state";
import { ProfileHeader } from "../../features/profile/profile-header";
import {
  useUpdateProfile,
  useUserComments,
  useUserThreads,
} from "../../features/profile/use-profile";
import type { UpdateProfileInput } from "../../features/profile/api";

export function ProfilePage() {
  const { user, status, refresh } = useAuth();
  const [editOpen, setEditOpen] = useState(false);
  const [avatarSubmitting, setAvatarSubmitting] = useState(false);
  const [isPublic, setIsPublic] = useState(user?.isPublic ?? true);

  useEffect(() => {
    if (user !== null) setIsPublic(user.isPublic);
  }, [user]);

  const update = useUpdateProfile();
  const threadsQuery = useUserThreads(
    user?.userId ?? "",
    status === "authenticated",
  );
  const commentsQuery = useUserComments(
    user?.userId ?? "",
    status === "authenticated",
  );

  if (status !== "authenticated" || user === null) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground">
        <Spinner />
      </div>
    );
  }

  async function handleSave(
    input: UpdateProfileInput,
    avatar: AvatarChangeAction,
  ) {
    let uploadedId: string | null = null
    try {
      let profileInput = input
      if (avatar.type === "upload") {
        setAvatarSubmitting(true)
        const asset = await uploadAvatar(avatar.file)
        uploadedId = asset.id
        profileInput = { ...input, avatarMediaId: asset.id }
      } else if (avatar.type === "remove") {
        profileInput = { ...input, avatarMediaId: null }
      }

      await update.mutateAsync(profileInput)
      setEditOpen(false)
      void refresh()
    } catch {
      if (uploadedId !== null) {
        void deleteMediaUpload(uploadedId).catch(() => undefined)
      }
    } finally {
      setAvatarSubmitting(false)
    }
  }

  function handleVisibility(next: boolean) {
    setIsPublic(next);
    update.mutate({ isPublic: next }, { onSuccess: () => void refresh() });
  }

  const toggleError =
    update.isError && !editOpen
      ? (update.error?.message ?? "Could not update your profile.")
      : null;

  return (
    <div className="mx-auto w-full max-w-4xl flex-1 px-6 lg:px-10">
      <ProfileHeader
        owner
        profile={user}
        actions={
          <Button
            type="button"
            variant="outline"
            className="h-11 rounded-none border-foreground/20 px-4 shadow-none"
            onClick={() => setEditOpen(true)}
          >
            Edit profile
          </Button>
        }
      />

      <section
        aria-labelledby="visibility-title"
        className="mt-8 border-t border-foreground/15 pt-6"
      >
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <h2
              id="visibility-title"
              className="font-heading text-xl font-semibold tracking-[0.01em] uppercase"
            >
              Profile visibility
            </h2>
            <p className="mt-2 max-w-lg leading-7 text-muted-foreground">
              When on, other students can visit your profile and read your
              threads and comments. When off, only you can see your activity.
            </p>
            {toggleError !== null && (
              <p role="alert" className="mt-3 text-sm text-destructive">
                {toggleError}
              </p>
            )}
          </div>
          <Switch
            aria-label="Profile visibility"
            checked={isPublic}
            disabled={update.isPending}
            onCheckedChange={(next) => handleVisibility(next)}
            className="mt-1"
          />
        </div>
      </section>

      {isPublic ? (
        <section aria-labelledby="activity-title" className="mt-14">
          <h2
            id="activity-title"
            className="font-heading text-2xl font-semibold tracking-[0.01em] uppercase"
          >
            Your activity
          </h2>
          <div className="mt-6">
            <ActivityFeed
              threads={threadsQuery.data?.items ?? []}
              comments={commentsQuery.data?.items ?? []}
              loading={threadsQuery.isPending || commentsQuery.isPending}
              error={
                threadsQuery.isError
                  ? (threadsQuery.error?.message ?? null)
                  : commentsQuery.isError
                    ? (commentsQuery.error?.message ?? null)
                    : null
              }
              threadsEmptyLabel="Start a thread in a society you’ve joined and it will collect here."
              commentsEmptyLabel="Comment on a thread and your replies will collect here."
            />
          </div>
        </section>
      ) : (
        <PrivateProfileState displayName={user.displayName} />
      )}

      <EditProfileDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        initialDisplayName={user.displayName}
        initialBio={user.bio}
        initialAvatarMediaId={user.avatarMediaId}
        onSave={handleSave}
        isSaving={update.isPending || avatarSubmitting}
        error={update.isError ? (update.error?.message ?? null) : null}
      />
    </div>
  );
}
