export interface DiscussionItem {
  readonly id: string
  readonly title: string
  readonly body: string | null
  readonly score: number
  readonly commentCount: number
  readonly createdAt: string
  readonly authorId: string
  readonly authorDisplayName: string | null
  readonly societySlug: string | null
  readonly societyName: string | null
  readonly myVote: -1 | 0 | 1
  readonly mediaIds: readonly string[]
  readonly analysisDecision?: "allow" | "review" | null
}
