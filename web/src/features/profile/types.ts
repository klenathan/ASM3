export interface PublicProfile {
  readonly userId: string
  readonly displayName: string
  readonly bio: string | null
  readonly avatarMediaId: string | null
  readonly platformRole: 'student' | 'system_admin'
  readonly status: 'active' | 'suspended' | 'deactivated'
  readonly isPublic: boolean
  readonly isOwner: boolean
  readonly createdAt: string
}

export interface UserThreadActivity {
  readonly id: string
  readonly title: string
  readonly body: string | null
  readonly score: number
  readonly commentCount: number
  readonly mediaIds: readonly string[]
  readonly createdAt: string
  readonly updatedAt: string
  readonly societyId: string
  readonly societySlug: string
  readonly societyName: string
  readonly authorId: string
  readonly authorDisplayName: string
  readonly authorAvatarMediaId: string | null
  readonly myVote: -1 | 0 | 1
  readonly analysisDecision?: 'allow' | 'review' | null
  readonly analysisOverride?: 'accept' | 'reject' | null
}

export interface UserThreadActivityPage {
  readonly items: UserThreadActivity[]
  readonly nextCursor: string | null
  readonly hasMore: boolean
}

export interface UserCommentActivity {
  readonly id: string
  readonly threadId: string
  readonly threadTitle: string
  readonly societyId: string
  readonly societySlug: string
  readonly societyName: string
  readonly body: string | null
  readonly score: number
  readonly createdAt: string
  readonly authorId: string
  readonly authorDisplayName: string
  readonly authorAvatarMediaId: string | null
}

export interface UserCommentActivityPage {
  readonly items: UserCommentActivity[]
  readonly nextCursor: string | null
  readonly hasMore: boolean
}
