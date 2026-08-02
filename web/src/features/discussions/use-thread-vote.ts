import {
  type InfiniteData,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query"

import { voteThread } from "./api"

function timeAgo(value: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000))
  if (seconds < 60) return "just now"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

export interface LikeInput {
  readonly threadId: string
  readonly value: -1 | 0 | 1
}

interface PageLike {
  readonly items?: readonly { readonly id: string; readonly myVote?: -1 | 0 | 1; readonly score: number }[]
}

function isThreadsQuery(queryKey: readonly unknown[]): boolean {
  if (queryKey[0] === "feed" && queryKey[1] === "home") return true
  if (queryKey[0] === "societies" && queryKey[2] === "threads") return true
  if (queryKey[0] === "profile" && queryKey[1] === "threads") return true
  return false
}

function applyPage(page: PageLike, threadId: string, value: -1 | 0 | 1, score?: number): PageLike {
  const items = page.items?.map((item) => {
    if (item.id !== threadId) return item
    const appliedScore = score ?? item.score + (value - (item.myVote ?? 0))
    return { ...item, myVote: value, score: appliedScore }
  })
  return { ...page, items }
}

function applyVote(data: unknown, threadId: string, value: -1 | 0 | 1, score?: number): unknown {
  if (Array.isArray((data as InfiniteData<unknown>)?.pages)) {
    const infinite = data as InfiniteData<unknown>
    return { ...infinite, pages: infinite.pages.map((page) => applyPage(page as PageLike, threadId, value, score)) }
  }
  return applyPage(data as PageLike, threadId, value, score)
}

export function useThreadVote() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ threadId, value }: LikeInput) => voteThread(threadId, value),
    onMutate: async ({ threadId, value }) => {
      await queryClient.cancelQueries({ predicate: (query) => isThreadsQuery(query.queryKey) })
      const previous = queryClient.getQueriesData({
        predicate: (query) => isThreadsQuery(query.queryKey),
      })
      queryClient.setQueriesData(
        { predicate: (query) => isThreadsQuery(query.queryKey) },
        (old) => applyVote(old, threadId, value),
      )
      return { previous }
    },
    onSuccess: (vote) => {
      queryClient.setQueriesData(
        { predicate: (query) => isThreadsQuery(query.queryKey) },
        (old) => applyVote(old, vote.targetId, vote.value, vote.score),
      )
    },
    onError: (_error, _variables, context) => {
      if (context?.previous === undefined) return
      for (const [key, data] of context.previous) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        queryClient.setQueryData(key, data)
      }
    },
  })
}

export { timeAgo }
