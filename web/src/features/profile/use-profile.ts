import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  fetchPublicProfile,
  fetchUserComments,
  fetchUserThreads,
  updateProfile as updateProfileRequest,
} from "./api";
import type { PublicProfile } from "./types";

export function usePublicProfile(userId: string) {
  return useQuery({
    queryKey: ["profile", "public", userId],
    queryFn: () => fetchPublicProfile(userId),
    enabled: userId.length > 0,
  })
}

export function useUserThreads(userId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["profile", "threads", userId],
    queryFn: () => fetchUserThreads(userId),
    enabled: enabled && userId.length > 0,
  })
}

export function useUserComments(userId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["profile", "comments", userId],
    queryFn: () => fetchUserComments(userId),
    enabled: enabled && userId.length > 0,
  })
}

export function useUpdateProfile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: updateProfileRequest,
    onSuccess: (updated) => {
      void queryClient.setQueryData(["profile", "public", updated.userId], {
        userId: updated.userId,
        displayName: updated.displayName,
        bio: updated.bio,
        avatarMediaId: updated.avatarMediaId,
        platformRole: updated.platformRole,
        status: updated.status,
        isPublic: updated.isPublic,
      } as PublicProfile)
    },
  })
}
