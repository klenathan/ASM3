import type { ThreadLocation } from "../societies/types";

export interface HomeFeedThread {
  readonly id: string
  readonly societyId: string
  readonly societySlug: string
  readonly societyName: string
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
  readonly analysisFailed?: boolean
  readonly analysisOverride?: 'accept' | 'reject' | null
  readonly location: ThreadLocation | null
}

export interface HomeFeedPage {
  readonly items: HomeFeedThread[]
  readonly nextCursor: string | null
  readonly hasMore: boolean
}
