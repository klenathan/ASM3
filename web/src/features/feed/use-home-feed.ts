import { useInfiniteQuery } from "@tanstack/react-query"

import { fetchHomeFeed } from "./api"

export function useHomeFeed() {
  return useInfiniteQuery({
    queryKey: ["feed", "home"],
    queryFn: ({ pageParam }) => fetchHomeFeed(pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  })
}
