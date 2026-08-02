import { request } from "../../lib/http"

export interface VoteResult {
  readonly targetType: "thread" | "comment"
  readonly targetId: string
  readonly value: -1 | 0 | 1
  readonly score: number
}

export function voteThread(threadId: string, value: -1 | 0 | 1): Promise<VoteResult> {
  return request<VoteResult>(`/api/v1/threads/${encodeURIComponent(threadId)}/vote`, {
    method: "PUT",
    body: JSON.stringify({ value }),
  })
}
