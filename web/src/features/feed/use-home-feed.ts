import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query"

import { fetchHomeFeed, voteThread } from "./api"
import type { HomeFeedPage } from "./types"

const FEED_KEY = ["feed", "home"] as const

export function useHomeFeed() {
  return useInfiniteQuery({
    queryKey: FEED_KEY,
    queryFn: ({ pageParam }) => fetchHomeFeed(pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  })
}

export interface LikeInput {
  readonly threadId: string
  readonly value: -1 | 0 | 1
}

export function useThreadLike() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ threadId, value }: LikeInput) => voteThread(threadId, value),
    onMutate: async ({ threadId, value }) => {
      await queryClient.cancelQueries({ queryKey: FEED_KEY })
      const previous = queryClient.getQueryData<InfiniteData<HomeFeedPage>>(FEED_KEY)

      queryClient.setQueryData<InfiniteData<HomeFeedPage>>(FEED_KEY, (current) => {
        if (current === undefined) return current
        return {
          ...current,
          pages: current.pages.map((page) => ({
            ...page,
            items: page.items.map((item) => {
              if (item.id !== threadId) return item
              const delta = value - item.myVote
              return { ...item, myVote: value, score: item.score + delta }
            }),
          })),
        }
      })

      return { previous }
    },
    onSuccess: (vote) => {
      queryClient.setQueryData<InfiniteData<HomeFeedPage>>(FEED_KEY, (current) => {
        if (current === undefined) return current
        return {
          ...current,
          pages: current.pages.map((page) => ({
            ...page,
            items: page.items.map((item) =>
              item.id === vote.targetId
                ? { ...item, score: vote.score, myVote: vote.value }
                : item,
            ),
          })),
        }
      })
    },
    onError: (_error, _variables, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData<InfiniteData<HomeFeedPage>>(FEED_KEY, context.previous)
      }
    },
  })
}
