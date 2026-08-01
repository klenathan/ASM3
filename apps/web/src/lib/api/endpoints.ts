import { api } from "./client";
import type {
  Appeal,
  AppealCreate,
  Comment,
  CommentCreate,
  FeedPage,
  ModerationDecisionRecord,
  ModerationItem,
  ModerationQueue,
  ModerationReview,
  Notification,
  Post,
  PostCreate,
  Report,
  ReportCreate,
  Society,
  SocietyMembership,
  SocietyPostsResponse,
  User,
  UserProfileUpdate,
} from "./types";

interface AuthTokens {
  access_token: string;
  expires_in: number;
  token_type: string;
}

export const endpoints = {
  auth: {
    signIn: (username: string, password: string) =>
      api.post<AuthTokens>("/auth/sign-in", { username, password }),
    signUp: (payload: {
      email: string;
      password: string;
      display_name: string;
      major: string;
    }) =>
      api.post<{ username: string; confirmation_required: boolean }>(
        "/auth/sign-up",
        payload
      ),
    confirm: (username: string, password: string, confirmationCode: string) =>
      api.post<AuthTokens>("/auth/confirm", {
        username,
        password,
        confirmation_code: confirmationCode,
      }),
  },
  me: {
    bootstrap: () => api.post<User>("/me/bootstrap"),
    get: () => api.get<User>("/me"),
    update: (payload: UserProfileUpdate) => api.patch<User>("/me", payload),
    deactivate: () => api.delete<void>("/me/deactivate"),
  },
  users: {
    get: (handle: string) => api.get<User>(`/users/${handle}`),
    posts: (handle: string) =>
      api.get<FeedPage<Post>>(`/users/${handle}/posts`),
    follow: (userId: string) => api.put<void>(`/users/${userId}/follow`),
    unfollow: (userId: string) => api.delete<void>(`/users/${userId}/follow`),
    block: (userId: string) => api.put<void>(`/users/${userId}/block`),
    unblock: (userId: string) => api.delete<void>(`/users/${userId}/block`),
  },
  societies: {
    list: () => api.get<Society[]>("/societies"),
    get: (slug: string) => api.get<Society>(`/r/${slug}`),
    posts: (slug: string) =>
      api.get<SocietyPostsResponse>(`/r/${slug}/posts`),
    join: (slug: string) => api.post<void>(`/r/${slug}/join`),
    leave: (slug: string) => api.delete<void>(`/r/${slug}/join`),
    members: (slug: string) =>
      api.get<SocietyMembership[]>(`/r/${slug}/members`),
  },
  posts: {
    create: (slug: string, payload: PostCreate) =>
      api.post<Post>(`/r/${slug}/posts`, payload),
    get: (postId: string) => api.get<Post>(`/posts/${postId}`),
    edit: (postId: string, payload: PostCreate) =>
      api.patch<Post>(`/posts/${postId}`, payload),
    delete: (postId: string) => api.delete<void>(`/posts/${postId}`),
    pin: (postId: string, pinned = true) =>
      api.post<Post>(`/posts/${postId}/pin?pinned=${pinned}`),
    lock: (postId: string, locked = true) =>
      api.post<Post>(`/posts/${postId}/lock?locked=${locked}`),
    comments: (postId: string) =>
      api.get<Comment[]>(`/posts/${postId}/comments`),
  },
  comments: {
    create: (postId: string, payload: CommentCreate) =>
      api.post<Comment>(`/posts/${postId}/comments`, payload),
    reply: (commentId: string, payload: CommentCreate) =>
      api.post<Comment>(`/comments/${commentId}/comments`, payload),
    edit: (commentId: string, payload: CommentCreate) =>
      api.patch<Comment>(`/comments/${commentId}`, payload),
    delete: (commentId: string) => api.delete<void>(`/comments/${commentId}`),
  },
  engagement: {
    votePost: (postId: string) => api.put<void>(`/posts/${postId}/vote`),
    unvotePost: (postId: string) =>
      api.delete<void>(`/posts/${postId}/vote`),
    voteComment: (commentId: string) =>
      api.put<void>(`/comments/${commentId}/vote`),
    unvoteComment: (commentId: string) =>
      api.delete<void>(`/comments/${commentId}/vote`),
    report: (payload: ReportCreate) =>
      api.post<Report>("/reports", payload),
    notifications: () => api.get<Notification[]>("/notifications"),
    markRead: (notificationId: string) =>
      api.post<void>(`/notifications/${notificationId}/read`),
  },
  feeds: {
    school: () => api.get<FeedPage<Post>>("/feeds/rmit"),
    joined: () => api.get<FeedPage<Post>>("/feeds/joined"),
    following: () => api.get<FeedPage<Post>>("/feeds/following"),
  },
  moderation: {
    queue: (state: string) =>
      api.get<ModerationQueue>(`/moderation/queue?state=${state}`),
    item: (contentId: string) =>
      api.get<ModerationItem>(`/moderation/items/${contentId}`),
    decide: (
      contentId: string,
      contentType: string,
      review: ModerationReview
    ) =>
      api.post<ModerationDecisionRecord>(
        `/moderation/items/${contentId}/decisions?content_type=${contentType}`,
        review
      ),
    appeals: (state: string = "OPEN") =>
      api.get<Appeal[]>(`/moderation/appeals?state=${state}`),
    decideAppeal: (appealId: string, upheld: boolean, reason: string) =>
      api.post<Appeal>(
        `/moderation/appeals/${appealId}/decision?upheld=${upheld}&reason=${encodeURIComponent(reason)}`
      ),
  },
  appeals: {
    create: (contentId: string, contentType: string, payload: AppealCreate) =>
      api.post<Appeal>(
        `/content/${contentId}/appeals?content_type=${contentType}`,
        payload
      ),
  },
};
