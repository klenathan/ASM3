import { request } from "../../lib/http";
import type {
  PublicProfile,
  UserCommentActivityPage,
  UserThreadActivityPage,
} from "./types";

export interface UpdateProfileInput {
  readonly displayName?: string
  readonly bio?: string | null
  readonly isPublic?: boolean
}

export interface ProfileUser {
  readonly userId: string
  readonly email: string
  readonly displayName: string
  readonly bio: string | null
  readonly avatarMediaId: string | null
  readonly platformRole: 'student' | 'system_admin'
  readonly status: 'active' | 'suspended' | 'deactivated'
  readonly isPublic: boolean
  readonly suspendedUntil: string | null
  readonly createdAt: string
  readonly updatedAt: string
}

function pageQuery(cursor: string | undefined): string {
  return cursor === undefined ? "" : `?cursor=${encodeURIComponent(cursor)}`
}

export function fetchPublicProfile(userId: string): Promise<PublicProfile> {
  return request<PublicProfile>(`/api/v1/users/${encodeURIComponent(userId)}`)
}

export function fetchUserThreads(
  userId: string,
  cursor?: string,
): Promise<UserThreadActivityPage> {
  return request<UserThreadActivityPage>(
    `/api/v1/users/${encodeURIComponent(userId)}/threads${pageQuery(cursor)}`,
  )
}

export function fetchUserComments(
  userId: string,
  cursor?: string,
): Promise<UserCommentActivityPage> {
  return request<UserCommentActivityPage>(
    `/api/v1/users/${encodeURIComponent(userId)}/comments${pageQuery(cursor)}`,
  )
}

export function updateProfile(input: UpdateProfileInput): Promise<ProfileUser> {
  return request<ProfileUser>("/api/v1/users/me", {
    method: "PATCH",
    body: JSON.stringify(input),
  })
}
