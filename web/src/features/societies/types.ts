export interface Society {
  readonly id: string
  readonly slug: string
  readonly name: string
  readonly description: string
  readonly avatarMediaId: string
  readonly status: 'active' | 'archived'
  readonly createdBy: string
  readonly createdAt: string
  readonly updatedAt: string
}

export interface MembershipSummary {
  readonly role: 'member' | 'moderator'
  readonly status: 'active' | 'left' | 'banned'
}

export interface SocietyDiscoveryItem extends Society {
  readonly membership: MembershipSummary | null
}

export interface MySociety {
  readonly id: string
  readonly slug: string
  readonly name: string
  readonly avatarMediaId: string
  readonly membership: MembershipSummary
}

export interface SocietyPage {
  readonly items: SocietyDiscoveryItem[]
  readonly nextCursor: string | null
  readonly hasMore: boolean
}

export interface Thread {
  readonly id: string
  readonly societyId: string
  readonly authorId: string
  readonly title: string
  readonly body: string | null
  readonly status: 'published' | 'removed' | 'deleted'
  readonly score: number
  readonly commentCount: number
  readonly mediaIds: readonly string[]
  readonly authorDisplayName: string | null
  readonly authorAvatarMediaId: string | null
  readonly myVote: -1 | 0 | 1
  readonly createdAt: string
  readonly updatedAt: string
  readonly deletedAt: string | null
  readonly analysisDecision?: 'allow' | 'review' | null
}

export interface ThreadPage {
  readonly items: Thread[]
  readonly nextCursor: string | null
  readonly hasMore: boolean
}

export interface Comment {
  readonly id: string
  readonly threadId: string
  readonly authorId: string
  readonly parentId: string | null
  readonly body: string | null
  readonly status: 'published' | 'removed' | 'deleted'
  readonly score: number
  readonly authorDisplayName: string | null
  readonly authorAvatarMediaId: string | null
  readonly myVote: -1 | 0 | 1
  readonly createdAt: string
  readonly updatedAt: string
  readonly deletedAt: string | null
}

export interface CommentPage {
  readonly items: readonly Comment[]
  readonly nextCursor: string | null
  readonly hasMore: boolean
}

export interface CreateThreadInput {
  readonly title: string
  readonly body: string
  readonly mediaIds?: readonly string[]
}

export interface CreateThreadDraft {
  readonly title: string
  readonly body: string
  readonly images: readonly File[]
}

export interface SocietyMembership {
  readonly societyId: string
  readonly userId: string
  readonly role: 'member' | 'moderator'
  readonly status: 'active' | 'left' | 'banned'
  readonly joinedAt: string
  readonly updatedAt: string
  readonly bannedBy: string | null
  readonly bannedAt: string | null
}
