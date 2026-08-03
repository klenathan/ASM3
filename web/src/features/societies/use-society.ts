import {
  keepPreviousData,
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import {
  createSocietyThreadFromDraft,
  fetchMembership,
  fetchMySocieties,
  fetchSociety,
  fetchSocietyPage,
  fetchSocietyThreads,
  joinSociety,
  leaveSociety,
} from "./api";
import type { CreateThreadDraft, ThreadPage } from "./types";

export function useSocietyDiscovery(query: string) {
  const normalized = query.trim().toLowerCase()
  return useInfiniteQuery({
    queryKey: ["societies", "discover", normalized],
    queryFn: ({ pageParam }) =>
      fetchSocietyPage({
        q: normalized === "" ? undefined : normalized,
        cursor: pageParam as string | undefined,
        limit: 20,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    placeholderData: keepPreviousData,
  })
}

export function useSociety(slug: string) {
  return useQuery({
    queryKey: ["societies", slug],
    queryFn: () => fetchSociety(slug),
    enabled: slug.length > 0,
  })
}

export function useMySocieties() {
  return useQuery({
    queryKey: ["societies", "mine"],
    queryFn: fetchMySocieties,
  })
}

export function useSocietyMembership(slug: string, enabled = true) {
  return useQuery({
    queryKey: ["societies", slug, "membership"],
    queryFn: () => fetchMembership(slug),
    enabled: enabled && slug.length > 0,
  })
}

export function useSocietyThreads(slug: string) {
  return useInfiniteQuery({
    queryKey: ["societies", slug, "threads"],
    queryFn: ({ pageParam }) =>
      fetchSocietyThreads(slug, pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: slug.length > 0,
  })
}

export function useCreateSocietyThread(slug: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (draft: CreateThreadDraft) => createSocietyThreadFromDraft(slug, draft),
    onSuccess: (thread) => {
      queryClient.setQueryData<InfiniteData<ThreadPage>>(
        ["societies", slug, "threads"],
        (current) => {
          const firstPage = current?.pages[0]
          if (current === undefined || firstPage === undefined) return current

          return {
            ...current,
            pages: [
              {
                ...firstPage,
                items: [
                  thread,
                  ...firstPage.items.filter((item) => item.id !== thread.id),
                ],
              },
              ...current.pages.slice(1),
            ],
          }
        },
      )
      void queryClient.invalidateQueries({
        queryKey: ["societies", slug, "threads"],
        exact: true,
      })
    },
  })
}

export function useJoinSociety(slug: string) {
  const queryClient = useQueryClient()
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["societies", slug] })
    void queryClient.invalidateQueries({ queryKey: ["societies", "discover"] })
    void queryClient.invalidateQueries({ queryKey: ["societies", "mine"] })
  }
  return useMutation({
    mutationFn: () => joinSociety(slug),
    onSuccess: invalidate,
  })
}

export function useLeaveSociety(slug: string) {
  const queryClient = useQueryClient()
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["societies", slug] })
    void queryClient.invalidateQueries({ queryKey: ["societies", "discover"] })
    void queryClient.invalidateQueries({ queryKey: ["societies", "mine"] })
  }
  return useMutation({
    mutationFn: () => leaveSociety(slug),
    onSuccess: invalidate,
  })
}
