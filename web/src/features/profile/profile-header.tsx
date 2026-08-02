import { Lock, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "../../components/ui/avatar";
import { Badge } from "../../components/ui/badge";
import { useMediaUrl } from "../media/use-media-url";

export interface ProfileHeaderData {
  readonly userId: string
  readonly displayName: string
  readonly bio: string | null
  readonly avatarMediaId: string | null
  readonly platformRole: 'student' | 'system_admin'
  readonly status: 'active' | 'suspended' | 'deactivated'
  readonly isPublic: boolean
  readonly createdAt: string
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

function joinedLabel(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
  })
}

export function ProfileHeader({
  profile,
  owner = false,
  actions,
}: {
  profile: ProfileHeaderData
  owner?: boolean
  actions?: ReactNode
}) {
  const avatarUrl = useMediaUrl(profile.avatarMediaId)
  const roleLabel = profile.platformRole === "system_admin" ? "System admin" : "Member"

  return (
    <section
      aria-labelledby="profile-name"
      className="mt-8 border-t-2 border-foreground pt-8"
    >
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:gap-7">
        <Avatar className="!size-20 shrink-0 rounded-full md:!size-24">
          {avatarUrl.data ? (
            <AvatarImage
              src={avatarUrl.data.url}
              alt={`${profile.displayName} avatar`}
              className="rounded-full"
            />
          ) : null}
          <AvatarFallback className="rounded-full bg-primary text-lg font-semibold text-primary-foreground md:text-xl">
            {initials(profile.displayName)}
          </AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1
              id="profile-name"
              className="font-heading text-[clamp(2rem,4vw,3rem)] leading-none font-semibold tracking-[-0.01em] uppercase"
            >
              {profile.displayName}
            </h1>
            {owner && !profile.isPublic && (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-[0.08em] text-primary uppercase">
                <Lock aria-hidden="true" className="size-3.5" /> Private
              </span>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <Badge
              variant={profile.platformRole === "system_admin" ? "default" : "outline"}
              className="gap-1.5 rounded-none px-2.5 font-medium normal-case"
            >
              {profile.platformRole === "system_admin" ? (
                <ShieldCheck aria-hidden="true" className="size-3.5" />
              ) : null}
              {roleLabel}
            </Badge>
            <span className="text-xs tracking-[0.08em] text-muted-foreground uppercase">
              Joined {joinedLabel(profile.createdAt)}
            </span>
          </div>

          {profile.bio !== null && profile.bio !== "" ? (
            <p className="mt-4 max-w-2xl text-lg leading-8 text-muted-foreground">
              {profile.bio}
            </p>
          ) : owner ? (
            <p className="mt-4 max-w-2xl text-lg leading-8 text-muted-foreground">
              Tell your table who you are.
            </p>
          ) : null}
        </div>

        {actions !== undefined ? (
          <div className="flex shrink-0 items-center gap-3 sm:self-start">{actions}</div>
        ) : null}
      </div>
    </section>
  )
}
