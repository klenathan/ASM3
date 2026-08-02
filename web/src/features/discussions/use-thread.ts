import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"

import type { CommentPage } from "../societies/types"
import {
  createComment,
  fetchThread,
  fetchThreadComments,
  voteThread,
  voteComment,
} from "./api"

export function useThread(threadId: string) {
  return useQuery({
    queryKey: ["threads", threadId],
    queryFn: () => fetchThread(threadId),
    enabled: threadId.length > 0,
  })
}

export function useThreadComments(threadId: string) {
  return useInfiniteQuery({
    queryKey: ["threads", threadId, "comments"],
    queryFn: ({ pageParam }) => fetchThreadComments(threadId, pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: threadId.length > 0,
  })
}

export function useCreateComment(threadId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ body, parentId }: { readonly body: string; readonly parentId?: string }) =>
      createComment(threadId, body, parentId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["threads", threadId, "comments"] })
      void queryClient.invalidateQueries({ queryKey: ["threads", threadId] })
    },
  })
}

export function useCommentVote(threadId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ commentId, value }: { readonly commentId: string; readonly value: -1 | 0 | 1 }) =>
      voteComment(commentId, value),
    onMutate: async ({ commentId, value }) => {
      const key = ["threads", threadId, "comments"]
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<InfiniteData<CommentPage>>(key)
      queryClient.setQueryData<InfiniteData<CommentPage>>(key, (current) => {
        if (current === undefined) return current
        return {
          ...current,
          pages: current.pages.map((page) => ({
            ...page,
            items: page.items.map((comment) => comment.id !== commentId
              ? comment
              : {
                  ...comment,
                  myVote: value,
                  score: comment.score + value - comment.myVote,
                }),
          })),
        }
      })
      return { previous }
    },
    onSuccess: (vote) => {
      queryClient.setQueryData<InfiniteData<CommentPage>>(
        ["threads", threadId, "comments"],
        (current) => current === undefined ? current : {
          ...current,
          pages: current.pages.map((page) => ({
            ...page,
            items: page.items.map((comment) => comment.id !== vote.targetId
              ? comment
              : { ...comment, myVote: vote.value, score: vote.score }),
          })),
        },
      )
    },
    onError: (_error, _variables, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(["threads", threadId, "comments"], context.previous)
      }
    },
  })
}

export function useThreadDetailVote(threadId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (value: -1 | 0 | 1) => voteThread(threadId, value),
    onMutate: async (value) => {
      const key = ["threads", threadId]
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<{ readonly score: number; readonly myVote: -1 | 0 | 1 }>(key)
      queryClient.setQueryData(key, (current: typeof previous) => current === undefined ? current : {
        ...current,
        myVote: value,
        score: current.score + value - current.myVote,
      })
      return { previous }
    },
    onSuccess: (vote) => {
      queryClient.setQueryData<{ readonly score: number; readonly myVote: -1 | 0 | 1 }>(
        ["threads", threadId],
        (current) => current === undefined ? current : { ...current, score: vote.score, myVote: vote.value },
      )
    },
    onError: (_error, _value, context) => {
      if (context?.previous !== undefined) queryClient.setQueryData(["threads", threadId], context.previous)
    },
  })
}
