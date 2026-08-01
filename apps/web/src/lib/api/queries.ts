import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { endpoints } from "./endpoints";
import type {
  Appeal,
  AppealCreate,
  Comment,
  CommentCreate,
  ModerationReview,
  Post,
  PostCreate,
  ReportCreate,
  UserProfileUpdate,
} from "./types";

export const queryKeys = {
  me: ["me"] as const,
  user: (handle: string) => ["user", handle] as const,
  userPosts: (handle: string) => ["user-posts", handle] as const,
  societies: ["societies"] as const,
  society: (slug: string) => ["society", slug] as const,
  societyPosts: (slug: string) => ["society-posts", slug] as const,
  post: (postId: string) => ["post", postId] as const,
  comments: (postId: string) => ["comments", postId] as const,
  feed: (kind: string) => ["feed", kind] as const,
  notifications: ["notifications"] as const,
  moderationQueue: (state: string) => ["moderation-queue", state] as const,
  moderationItem: (contentId: string) => ["moderation-item", contentId] as const,
  appeals: (state: string) => ["appeals", state] as const,
};

export function useMe() {
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: () => endpoints.me.get(),
  });
}

export function useUser(handle: string | undefined, enabled = true) {
  return useQuery({
    queryKey: queryKeys.user(handle ?? ""),
    queryFn: () => endpoints.users.get(handle as string),
    enabled: enabled && Boolean(handle),
  });
}

export function useUserPosts(handle: string | undefined, enabled = true) {
  return useQuery({
    queryKey: queryKeys.userPosts(handle ?? ""),
    queryFn: () => endpoints.users.posts(handle as string),
    enabled: enabled && Boolean(handle),
  });
}

export function useSocieties() {
  return useQuery({
    queryKey: queryKeys.societies,
    queryFn: () => endpoints.societies.list(),
  });
}

export function useSociety(slug: string | undefined, enabled = true) {
  return useQuery({
    queryKey: queryKeys.society(slug ?? ""),
    queryFn: () => endpoints.societies.get(slug as string),
    enabled: enabled && Boolean(slug),
  });
}

export function useSocietyPosts(slug: string | undefined, enabled = true) {
  return useQuery({
    queryKey: queryKeys.societyPosts(slug ?? ""),
    queryFn: () => endpoints.societies.posts(slug as string),
    enabled: enabled && Boolean(slug),
  });
}

export function usePost(postId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: queryKeys.post(postId ?? ""),
    queryFn: () => endpoints.posts.get(postId as string),
    enabled: enabled && Boolean(postId),
  });
}

export function useComments(postId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: queryKeys.comments(postId ?? ""),
    queryFn: () => endpoints.posts.comments(postId as string),
    enabled: enabled && Boolean(postId),
  });
}

export function useFeed(kind: "school" | "joined" | "following") {
  const fn = {
    school: endpoints.feeds.school,
    joined: endpoints.feeds.joined,
    following: endpoints.feeds.following,
  }[kind];
  return useQuery({
    queryKey: queryKeys.feed(kind),
    queryFn: fn,
    placeholderData: keepPreviousData,
  });
}

export function useNotifications() {
  return useQuery({
    queryKey: queryKeys.notifications,
    queryFn: () => endpoints.engagement.notifications(),
  });
}

export function useModerationQueue(state: string) {
  return useQuery({
    queryKey: queryKeys.moderationQueue(state),
    queryFn: () => endpoints.moderation.queue(state),
  });
}

export function useModerationItem(contentId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: queryKeys.moderationItem(contentId ?? ""),
    queryFn: () => endpoints.moderation.item(contentId as string),
    enabled: enabled && Boolean(contentId),
  });
}

export function useAppeals(state = "OPEN") {
  return useQuery({
    queryKey: queryKeys.appeals(state),
    queryFn: () => endpoints.moderation.appeals(state),
  });
}

export function useCreatePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      slug,
      payload,
    }: {
      slug: string;
      payload: PostCreate;
    }) => endpoints.posts.create(slug, payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["society-posts"] });
      void qc.invalidateQueries({ queryKey: ["feed"] });
    },
  });
}

export function useCreateComment() {
  return useMutation({
    mutationFn: ({
      postId,
      payload,
    }: {
      postId: string;
      payload: CommentCreate;
    }) => endpoints.comments.create(postId, payload),
  });
}

export function useReplyToComment() {
  return useMutation({
    mutationFn: ({
      commentId,
      payload,
    }: {
      commentId: string;
      payload: CommentCreate;
    }) => endpoints.comments.reply(commentId, payload),
  });
}

export function useVotePost() {
  return useMutation({
    mutationFn: (postId: string) => endpoints.engagement.votePost(postId),
  });
}

export function useUnvotePost() {
  return useMutation({
    mutationFn: (postId: string) => endpoints.engagement.unvotePost(postId),
  });
}

export function useReport() {
  return useMutation({
    mutationFn: (payload: ReportCreate) => endpoints.engagement.report(payload),
  });
}

export function useJoinSociety() {
  return useMutation({
    mutationFn: (slug: string) => endpoints.societies.join(slug),
  });
}

export function useLeaveSociety() {
  return useMutation({
    mutationFn: (slug: string) => endpoints.societies.leave(slug),
  });
}

export function useFollowUser() {
  return useMutation({
    mutationFn: (userId: string) => endpoints.users.follow(userId),
  });
}

export function useUnfollowUser() {
  return useMutation({
    mutationFn: (userId: string) => endpoints.users.unfollow(userId),
  });
}

export function useBlockUser() {
  return useMutation({
    mutationFn: (userId: string) => endpoints.users.block(userId),
  });
}

export function useUnblockUser() {
  return useMutation({
    mutationFn: (userId: string) => endpoints.users.unblock(userId),
  });
}

export function useUpdateProfile() {
  return useMutation({
    mutationFn: (payload: UserProfileUpdate) => endpoints.me.update(payload),
  });
}

export function useCreateAppeal() {
  return useMutation({
    mutationFn: ({
      contentId,
      contentType,
      payload,
    }: {
      contentId: string;
      contentType: string;
      payload: AppealCreate;
    }) => endpoints.appeals.create(contentId, contentType, payload),
  });
}

export function useDecideModeration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      contentId,
      contentType,
      review,
    }: {
      contentId: string;
      contentType: string;
      review: ModerationReview;
    }) => endpoints.moderation.decide(contentId, contentType, review),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["moderation-queue"] });
    },
  });
}

export function useDecideAppeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      appealId,
      upheld,
      reason,
    }: {
      appealId: string;
      upheld: boolean;
      reason: string;
    }) => endpoints.moderation.decideAppeal(appealId, upheld, reason),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["appeals"] });
    },
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (notificationId: string) =>
      endpoints.engagement.markRead(notificationId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.notifications });
    },
  });
}

export type { Appeal, Comment, Post };
