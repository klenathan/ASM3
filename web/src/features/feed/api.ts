import { request } from "../../lib/http"
import type { HomeFeedPage } from "./types"

export interface VoteResult {
  readonly targetType: "thread" | "comment"
  readonly targetId: string
  readonly value: -1 | 0 | 1
  readonly score: number
}

export function fetchHomeFeed(cursor?: string, limit = 20): Promise<HomeFeedPage> {
  const search = new URLSearchParams()
  search.set('limit', String(limit))
  if (cursor !== undefined) search.set('cursor', cursor)
  return request<HomeFeedPage>(`/api/v1/feed?${search.toString()}`)
}

export function voteThread(threadId: string, value: -1 | 0 | 1): Promise<VoteResult> {
  return request<VoteResult>(`/api/v1/threads/${encodeURIComponent(threadId)}/vote`, {
    method: "PUT",
    body: JSON.stringify({ value }),
  })
}
