import { ArrowLeft, Save } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { useAuth } from "@/auth/auth-provider";
import { useMe, useUpdateProfile, useUser, useUserPosts } from "@/lib/api/queries";
import { toMember } from "@/lib/model";

import { MemberAvatar, RoleBadge } from "@/components/member-bits";
import { PostCard } from "@/components/post-card";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";

export function ProfilePage() {
  const navigate = useNavigate();
  const { handle } = useParams<{ handle?: string }>();
  const { user: currentUser } = useAuth();

  // Viewing a specific handle, else the current user's own profile.
  const viewingSelf = !handle;
  const { data: me } = useMe();
  const { data: viewed } = useUser(handle, !viewingSelf);
  const targetUser = viewingSelf ? me : viewed;

  const posts = useUserPosts(
    viewingSelf ? me?.handle : handle,
    Boolean(viewingSelf ? me?.handle : handle)
  );

  if (!targetUser && !viewingSelf) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Spinner className="size-5" />
        <span className="ml-2 text-sm">Loading profile…</span>
      </div>
    );
  }

  if (!targetUser || !currentUser) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Spinner className="size-5" />
        <span className="ml-2 text-sm">Loading profile…</span>
      </div>
    );
  }

  const member = toMember(targetUser);
  const isSelf = targetUser.user_id === currentUser.user_id;

  return (
    <div className="space-y-6">
      {!viewingSelf && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(-1)}
          className="text-muted-foreground"
        >
          <ArrowLeft className="size-4" />
          Back
        </Button>
      )}

      {isSelf ? (
        <EditProfileCard member={member} bio={targetUser.bio} />
      ) : (
        <ViewProfileCard member={member} bio={targetUser.bio} />
      )}

      <section aria-label="Posts" className="space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Posts</h2>
        {posts.isLoading && (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Spinner className="size-4" />
            Loading posts…
          </div>
        )}
        {(posts.data?.items ?? []).length === 0 && !posts.isLoading && (
          <div className="rounded-md border border-dashed border-border p-12 text-center text-muted-foreground">
            <p className="font-display text-2xl font-black tracking-tight">
              No posts yet
            </p>
            <p className="mt-1 text-sm">Approved posts will appear here.</p>
          </div>
        )}
        {(posts.data?.items ?? []).map((p) => (
          <PostCard
            key={p.post_id}
            post={p}
            onOpen={(id) => navigate(`/post/${id}`)}
          />
        ))}
      </section>
    </div>
  );
}

function EditProfileCard({
  member,
  bio: initialBio,
}: {
  member: ReturnType<typeof toMember>;
  bio: string;
}) {
  const update = useUpdateProfile();
  const [bio, setBio] = useState(initialBio);

  return (
    <section className="rounded-md border border-border bg-card p-6">
      <div className="flex items-start gap-4">
        <MemberAvatar member={member} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate font-display text-2xl font-black tracking-tight">
              {member.name}
            </h1>
            <RoleBadge role={member.role} />
          </div>
          <p className="text-sm text-muted-foreground">@{member.handle}</p>
          <p className="mt-1 text-xs text-muted-foreground">{member.school}</p>
        </div>
      </div>

      <form
        className="mt-5 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          update.mutate({ bio });
        }}
      >
        <label
          htmlFor="profile-bio"
          className="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
        >
          Bio
        </label>
        <Textarea
          id="profile-bio"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="Tell your campus a little about yourself…"
          maxLength={300}
        />
        <div className="flex justify-end">
          <Button
            type="submit"
            size="sm"
            disabled={update.isPending || bio === initialBio}
          >
            {update.isPending ? (
              <>
                <Spinner className="size-3.5" />
                Saving…
              </>
            ) : (
              <>
                <Save className="size-3.5" />
                Save
              </>
            )}
          </Button>
        </div>
      </form>
    </section>
  );
}

function ViewProfileCard({
  member,
  bio,
}: {
  member: ReturnType<typeof toMember>;
  bio: string;
}) {
  return (
    <section className="rounded-md border border-border bg-card p-6">
      <div className="flex items-start gap-4">
        <MemberAvatar member={member} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate font-display text-2xl font-black tracking-tight">
              {member.name}
            </h1>
            <RoleBadge role={member.role} />
          </div>
          <p className="text-sm text-muted-foreground">@{member.handle}</p>
          <p className="mt-1 text-xs text-muted-foreground">{member.school}</p>
        </div>
      </div>
      {bio && (
        <p className="mt-4 max-w-2xl text-[0.9375rem] leading-relaxed text-foreground/80">
          {bio}
        </p>
      )}
    </section>
  );
}
