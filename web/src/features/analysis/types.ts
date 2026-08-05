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
  readonly status: "published" | "removed" | "deleted"
  readonly analysisDecision: "allow" | "review" | null
}

export interface AnalysisQueuePage {
  readonly items: AnalysisQueueThread[]
  readonly nextCursor: string | null
  readonly hasMore: boolean
}

export type FindingSeverity = "low" | "medium" | "high"
export type FindingSource = "title" | "body" | "image" | "comment"

export interface AnalysisFinding {
  readonly category: string
  readonly severity: FindingSeverity
  readonly confidence: number
  readonly source: FindingSource
  readonly sourceId?: string
  readonly evidence: string
}

/**
 * Full persisted automated content-analysis outcome for a single thread.
 * Null fields mean the field was not produced.
 */
export interface ThreadAnalysis {
  readonly runId: string
  readonly decision: "allow" | "review" | null
  readonly sentiment: { label: "positive" | "neutral" | "negative" | "mixed"; confidence: number } | null
  readonly findings: AnalysisFinding[] | null
  readonly summary: string | null
  readonly rationale: string | null
  readonly modelId: string | null
  readonly promptVersion: string | null
  readonly completedAt: string | null
}
