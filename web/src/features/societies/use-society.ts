import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import {
  fetchMembership,
  fetchSociety,
  fetchSocietyPage,
  fetchSocietyThreads,
  joinSociety,
  leaveSociety,
} from "./api";

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

export function useSocietyMembership(slug: string) {
  return useQuery({
    queryKey: ["societies", slug, "membership"],
    queryFn: () => fetchMembership(slug),
    enabled: slug.length > 0,
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

export function useJoinSociety(slug: string) {
  const queryClient = useQueryClient()
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["societies", slug] })
    void queryClient.invalidateQueries({ queryKey: ["societies", "discover"] })
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
  }
  return useMutation({
    mutationFn: () => leaveSociety(slug),
    onSuccess: invalidate,
  })
}
