import { ArrowLeft } from "lucide-react";
import { Link, useParams } from "react-router-dom";

import { Button } from "../../components/ui/button";
import { Spinner } from "../../components/ui/spinner";
import { ActivityFeed } from "../../features/profile/activity-feed";
import { PrivateProfileState } from "../../features/profile/private-state";
import { ProfileHeader } from "../../features/profile/profile-header";
import {
  usePublicProfile,
  useUserComments,
  useUserThreads,
} from "../../features/profile/use-profile";

export function UserProfilePage() {
  const { sid = "" } = useParams();
  const profileQuery = usePublicProfile(sid);
  const profile = profileQuery.data;

  const viewable =
    profile !== undefined && (profile.isPublic || profile.isOwner);
  const threadsQuery = useUserThreads(sid, viewable);
  const commentsQuery = useUserComments(sid, viewable);

  if (profileQuery.isPending) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground">
        <Spinner />
      </div>
    );
  }

  if (profileQuery.isError || profile === undefined) {
    return (
      <div className="mx-auto flex flex-1 flex-col items-center justify-center px-6 text-center">
        <p className="text-muted-foreground">
          {profileQuery.error?.message ?? "This profile could not be found."}
        </p>
        <Button
          type="button"
          variant="paper-outline"
          className="mt-6"
          asChild
        >
          <Link to="/">
            <ArrowLeft aria-hidden="true" /> Back to the forum
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl flex-1 px-6 lg:px-10">
      <ProfileHeader owner={profile.isOwner} profile={profile} />

      {viewable ? (
        <section
          aria-labelledby="activity-title"
          className="mt-14 border-t-2 border-foreground pt-10"
        >
          <h2
            id="activity-title"
            className="font-heading text-2xl font-semibold tracking-[0.01em] uppercase"
          >
            {profile.isOwner
              ? "Your activity"
              : `${profile.displayName}’s activity`}
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
              threadsEmptyLabel={
                profile.isOwner
                  ? "Start a thread in a society you’ve joined and it will collect here."
                  : `${profile.displayName} hasn’t started any threads yet.`
              }
              commentsEmptyLabel={
                profile.isOwner
                  ? "Comment on a thread and your replies will collect here."
                  : `${profile.displayName} hasn’t left any comments yet.`
              }
            />
          </div>
        </section>
      ) : (
        <PrivateProfileState displayName={profile.displayName} />
      )}
    </div>
  );
}
