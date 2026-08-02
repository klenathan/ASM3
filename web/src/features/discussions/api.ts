import { request } from "../../lib/http"
import type { Comment, CommentPage, Thread } from "../societies/types"

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

export function fetchThread(threadId: string): Promise<Thread> {
  return request<Thread>(`/api/v1/threads/${encodeURIComponent(threadId)}`)
}

export function fetchThreadComments(threadId: string, cursor?: string): Promise<CommentPage> {
  const query = cursor === undefined ? "" : `?cursor=${encodeURIComponent(cursor)}`
  return request<CommentPage>(`/api/v1/threads/${encodeURIComponent(threadId)}/comments${query}`)
}

export function createComment(threadId: string, body: string, parentId?: string): Promise<Comment> {
  return request<Comment>(`/api/v1/threads/${encodeURIComponent(threadId)}/comments`, {
    method: "POST",
    body: JSON.stringify({ body, ...(parentId === undefined ? {} : { parentId }) }),
  })
}

export function voteComment(commentId: string, value: -1 | 0 | 1): Promise<VoteResult> {
  return request<VoteResult>(`/api/v1/comments/${encodeURIComponent(commentId)}/vote`, {
    method: "PUT",
    body: JSON.stringify({ value }),
  })
}
