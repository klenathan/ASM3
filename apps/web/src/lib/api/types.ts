export type Role =
  | "STUDENT"
  | "STAFF"
  | "MODERATOR"
  | "RMIT_ADMIN"
  | "PLATFORM_ADMIN";

export type UserStatus = "ACTIVE" | "SUSPENDED" | "DEACTIVATED";

export type ContentState =
  | "PENDING"
  | "APPROVED"
  | "FLAGGED"
  | "REJECTED"
  | "FAILED";

export type ModerationDecision = "APPROVE" | "FLAG" | "REJECT" | "PENDING";
export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";
export type AppealState = "OPEN" | "UPHELD" | "REVERSED";
export type ReportState = "OPEN" | "RESOLVED" | "DISMISSED";
export type NotificationType =
  | "REPLY"
  | "FOLLOW"
  | "MODERATION"
  | "APPEAL"
  | "ANNOUNCEMENT";

export interface User {
  entity_type: "USER";
  user_id: string;
  cognito_sub: string;
  handle: string;
  display_name: string;
  bio: string;
  major: string;
  role: Role;
  status: UserStatus;
  institution_id: string;
  created_at: string;
  updated_at: string;
}

export interface UserProfileUpdate {
  display_name?: string;
  bio?: string;
  major?: string;
}

export interface Society {
  entity_type: "SOCIETY";
  society_id: string;
  slug: string;
  name: string;
  description: string;
  rules: string;
  owner_user_id: string;
  institution_id: string;
  member_count: number;
  created_at: string;
  updated_at: string;
}

export interface SocietyMembership {
  entity_type: "SOCIETY_MEMBERSHIP";
  society_id: string;
  user_id: string;
  is_moderator: boolean;
  joined_at: string;
}

export interface Post {
  entity_type: "POST";
  post_id: string;
  author_user_id: string;
  society_id: string;
  institution_id: string;
  title: string;
  body: string;
  state: ContentState;
  requires_warning: boolean;
  media_id: string | null;
  pinned: boolean;
  locked: boolean;
  deleted: boolean;
  removed_by_moderator: boolean;
  version: number;
  reply_count: number;
  vote_count: number;
  created_at: string;
  updated_at: string;
}

export interface Comment {
  entity_type: "COMMENT";
  comment_id: string;
  post_id: string;
  author_user_id: string;
  institution_id: string;
  parent_comment_id: string | null;
  path: string;
  depth: number;
  body: string;
  state: ContentState;
  requires_warning: boolean;
  media_id: string | null;
  deleted: boolean;
  removed_by_moderator: boolean;
  version: number;
  reply_count: number;
  vote_count: number;
  created_at: string;
  updated_at: string;
}

export interface FeedPage<T> {
  items: T[];
  next_cursor: string | null;
  pinned?: T[];
}

export interface SocietyPostsResponse {
  items: Post[];
  pinned: Post[];
  next_cursor: string | null;
}

export interface PostCreate {
  title: string;
  body: string;
  media_id?: string | null;
}

export interface CommentCreate {
  body: string;
  media_id?: string | null;
}

export interface Report {
  entity_type: "REPORT";
  report_id: string;
  content_id: string;
  reporter_user_id: string;
  reason: string;
  note: string;
  state: ReportState;
  institution_id: string;
  created_at: string;
  updated_at: string;
}

export interface ReportCreate {
  content_id: string;
  reason: string;
  note: string;
}

export interface Notification {
  entity_type: "NOTIFICATION";
  notification_id: string;
  recipient_user_id: string;
  type: NotificationType;
  content_id: string | null;
  actor_user_id: string | null;
  read: boolean;
  created_at: string;
  institution_id: string;
}

export interface Appeal {
  entity_type: "APPEAL";
  appeal_id: string;
  content_id: string;
  content_type: string;
  appellant_user_id: string;
  context: string;
  state: AppealState;
  decision_reason: string;
  reviewer_user_id: string | null;
  created_at: string;
  updated_at: string;
  institution_id: string;
}

export interface AppealCreate {
  context: string;
}

export interface LabelResult {
  category: string;
  score: number;
}

export interface ModerationDecisionRecord {
  entity_type: "MODERATION_DECISION";
  content_id: string;
  content_type: string;
  version: number;
  decision: ModerationDecision;
  actor_type: string;
  actor_user_id: string | null;
  reason: string;
  labels: LabelResult[];
  provider: string;
  model_version: string;
  policy_version: string;
  risk_level: RiskLevel;
  created_at: string;
  institution_id: string;
}

export interface ModerationReview {
  decision: ModerationDecision;
  reason: string;
  requires_warning: boolean;
}

export interface ModerationQueue {
  items: string[];
  next_cursor: string | null;
}

export interface ModerationItem {
  content_type: "post" | "comment";
  content: Post | Comment;
}

export interface AuditEvent {
  entity_type: "AUDIT_EVENT";
  audit_id: string;
  event_type: string;
  target_type: string;
  target_id: string;
  actor_user_id: string | null;
  actor_type: string;
  detail: Record<string, unknown>;
  created_at: string;
  institution_id: string;
}
