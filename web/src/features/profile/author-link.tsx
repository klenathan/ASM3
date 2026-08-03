import { Link } from "react-router-dom"

import { Avatar, AvatarFallback, AvatarImage } from "../../components/ui/avatar"
import { Skeleton } from "../../components/ui/skeleton"
import { useMediaUrl } from "../media/use-media-url"
import { usePublicProfile } from "./use-profile"

function initials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

/**
 * Renders an author's avatar and u/name link by fetching their public profile
 * from `authorId`. Falls back to a skeleton while loading and "[deleted]" when
 * the profile cannot be resolved.
 */
export function AuthorLink({
  authorId,
  className,
}: {
  readonly authorId: string
  readonly className?: string
}) {
  const profileQuery = usePublicProfile(authorId)
  const avatarUrl = useMediaUrl(profileQuery.data?.avatarMediaId)

  if (profileQuery.isPending) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 ${className ?? ""}`}
        aria-hidden="true"
      >
        <Skeleton className="size-6 rounded-full" />
        <Skeleton className="h-3 w-16" />
      </span>
    )
  }

  const profile = profileQuery.data

  if (profile === undefined) {
    return (
      <span className={`text-muted-foreground ${className ?? ""}`}>
        [deleted]
      </span>
    )
  }

  const name = profile.displayName

  return (
    <Link
      to={`/u/${authorId}`}
      className={`inline-flex items-center gap-1.5 font-semibold text-foreground hover:text-primary ${className ?? ""}`}
    >
      <Avatar size="sm">
        {avatarUrl.data !== undefined ? (
          <AvatarImage src={avatarUrl.data.url} alt={`${name} avatar`} />
        ) : null}
        <AvatarFallback>{initials(name)}</AvatarFallback>
      </Avatar>
      <span>u/{name}</span>
    </Link>
  )
}
