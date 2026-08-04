export type AnalysisQueueFilter = "all" | "none" | "review"

/**
 * A thread surfaced in the content-analysis review queue (moderator/admin).
 * Matches the backend `AnalysisQueueThreadDto`; carries the extra society
 * identity needed to deep-link from the admin-wide view.
 */
export interface AnalysisQueueThread {
  readonly id: string
  readonly societyId: string
  readonly societySlug: string
  readonly societyName: string
  readonly authorId: string
  readonly title: string
  readonly body: string | null
  readonly score: number
  readonly commentCount: number
  readonly mediaIds: readonly string[]
  readonly authorDisplayName: string | null
  readonly authorAvatarMediaId: string | null
  readonly myVote: -1 | 0 | 1
  readonly createdAt: string
  readonly updatedAt: string
  readonly deletedAt: string | null
  readonly analysisDecision: "allow" | "review" | null
}

export interface AnalysisQueuePage {
  readonly items: AnalysisQueueThread[]
  readonly nextCursor: string | null
  readonly hasMore: boolean
}
