import { z } from "zod";

import { DomainError } from "../../../shared/domain/errors";

/**
 * Action-event catalog v1.
 *
 * The analytics module owns this domain: only these event types exist in
 * schema version 1 and every catalogued event is society-scoped. Validation
 * makes invalid catalog events impossible at the persistence boundary.
 */

export const ACTION_EVENT_SCHEMA_VERSION = 1;

export const ACTION_EVENT_TYPES = [
  "thread_created",
  "thread_edited",
  "thread_deleted",
  "comment_created",
  "comment_edited",
  "comment_deleted",
  "thread_reaction_changed",
  "comment_reaction_changed",
  "society_membership_joined",
  "society_membership_left",
  "society_membership_activated",
  "society_membership_banned",
  "report_created",
  "moderation_report_decided",
  "moderation_content_removed",
] as const;

export type ActionEventType = (typeof ACTION_EVENT_TYPES)[number];

export const ACTION_EVENT_TARGET_TYPES = [
  "society",
  "thread",
  "comment",
  "report",
] as const;

export type ActionEventTargetType = (typeof ACTION_EVENT_TARGET_TYPES)[number];

export type ActorPlatformRole = "student" | "system_admin";
export type ActorSocietyRole = "member" | "moderator";

export type ReactionValue = -1 | 0 | 1;

export const REACTION_EVENT_TYPES = [
  "thread_reaction_changed",
  "comment_reaction_changed",
] as const;

export type ReactionEventType = (typeof REACTION_EVENT_TYPES)[number];

export const MAX_ACTION_EVENT_METADATA_BYTES = 2048;
export const MAX_CORRELATION_ID_LENGTH = 128;

/**
 * Per-event-type metadata. Every catalogue entry has an exact schema; events
 * without extra metadata require an empty object.
 */
export type ActionEventMetadata =
  | Record<string, never>
  | { readonly subjectRole: "member" | "moderator" }
  | { readonly reportedTargetType: "thread" | "comment" }
  | {
      readonly decision:
        | "dismissed"
        | "remove_content"
        | "ban_member"
        | "suspend_user";
    };

export type EmptyActionEventMetadata = Record<string, never>;

export interface ActionEventMetadataMap {
  readonly thread_created: EmptyActionEventMetadata;
  readonly thread_edited: EmptyActionEventMetadata;
  readonly thread_deleted: EmptyActionEventMetadata;
  readonly comment_created: EmptyActionEventMetadata;
  readonly comment_edited: EmptyActionEventMetadata;
  readonly comment_deleted: EmptyActionEventMetadata;
  readonly thread_reaction_changed: EmptyActionEventMetadata;
  readonly comment_reaction_changed: EmptyActionEventMetadata;
  readonly society_membership_joined: EmptyActionEventMetadata;
  readonly society_membership_left: EmptyActionEventMetadata;
  readonly society_membership_activated: { readonly subjectRole: "member" | "moderator" };
  readonly society_membership_banned: EmptyActionEventMetadata;
  readonly report_created: { readonly reportedTargetType: "thread" | "comment" };
  readonly moderation_report_decided: {
    readonly decision:
      | "dismissed"
      | "remove_content"
      | "ban_member"
      | "suspend_user";
  };
  readonly moderation_content_removed: EmptyActionEventMetadata;
}

export type ActionEventMetadataFor<E extends ActionEventType> =
  ActionEventMetadataMap[E];

const emptyMetadataSchema = z.strictObject({});

const actionEventMetadataSchemas = {
  thread_created: emptyMetadataSchema,
  thread_edited: emptyMetadataSchema,
  thread_deleted: emptyMetadataSchema,
  comment_created: emptyMetadataSchema,
  comment_edited: emptyMetadataSchema,
  comment_deleted: emptyMetadataSchema,
  thread_reaction_changed: emptyMetadataSchema,
  comment_reaction_changed: emptyMetadataSchema,
  society_membership_joined: emptyMetadataSchema,
  society_membership_left: emptyMetadataSchema,
  society_membership_activated: z.strictObject({
    subjectRole: z.enum(["member", "moderator"]),
  }),
  society_membership_banned: emptyMetadataSchema,
  report_created: z.strictObject({
    reportedTargetType: z.enum(["thread", "comment"]),
  }),
  moderation_report_decided: z.strictObject({
    decision: z.enum(["dismissed", "remove_content", "ban_member", "suspend_user"]),
  }),
  moderation_content_removed: emptyMetadataSchema,
} as const satisfies Record<
  ActionEventType,
  z.ZodType<ActionEventMetadataFor<ActionEventType>>
>;

/** Event-type-discriminated metadata validation used before persistence. */
export function parseActionEventMetadata<E extends ActionEventType>(
  eventType: E,
  metadata: unknown,
): ActionEventMetadataFor<E> {
  const result = actionEventMetadataSchemas[eventType].safeParse(metadata);

  if (!result.success) {
    throw new ActionEventInvalidError([
      {
        path: "metadata",
        message: `does not match the ${eventType} metadata schema: ${result.error.issues
          .map((issue) => issue.message)
          .join("; ")}`,
      },
    ]);
  }

  return result.data as ActionEventMetadataFor<E>;
}

/** The append payload a product transaction hands to the writer. */
export interface ActionEventInput<E extends ActionEventType = ActionEventType> {
  readonly eventId: string;
  readonly eventType: E;
  readonly schemaVersion: typeof ACTION_EVENT_SCHEMA_VERSION;
  /** RDS-only identity; never part of the export-facing payload. */
  readonly actorUserId: string;
  readonly actorPlatformRole: ActorPlatformRole;
  readonly actorSocietyRole: ActorSocietyRole | null;
  readonly occurredAt: Date;
  readonly targetType: ActionEventTargetType;
  readonly targetId: string;
  readonly societyId: string | null;
  readonly threadId: string | null;
  readonly commentId: string | null;
  readonly reportId: string | null;
  readonly correlationId: string;
  readonly fromReaction: ReactionValue | null;
  readonly toReaction: ReactionValue | null;
  readonly metadata: ActionEventMetadataFor<E>;
}

/** Row shape Glue may read: the direct actor identifier is stripped. */
export interface ExportableActionEvent {
  readonly eventId: string;
  readonly eventType: ActionEventType;
  readonly schemaVersion: typeof ACTION_EVENT_SCHEMA_VERSION;
  readonly actorPseudonym: string;
  readonly pseudonymKeyVersion: string;
  readonly actorPlatformRole: ActorPlatformRole;
  readonly actorSocietyRole: ActorSocietyRole | null;
  readonly occurredAt: Date;
  readonly targetType: ActionEventTargetType;
  readonly targetId: string;
  readonly societyId: string | null;
  readonly threadId: string | null;
  readonly commentId: string | null;
  readonly reportId: string | null;
  readonly correlationId: string;
  readonly fromReaction: ReactionValue | null;
  readonly toReaction: ReactionValue | null;
  readonly metadata: ActionEventMetadata;
}

export interface PersistedActionEvent extends ActionEventInput {
  readonly actorPseudonym: string;
  readonly pseudonymKeyVersion: string;
  readonly ingestedAt: Date;
}

/** Projection used by the export path; drops the direct actor identifier. */
export function toExportRow(event: PersistedActionEvent): ExportableActionEvent {
  const { actorUserId: _actorUserId, ...exportRow } = event;
  return exportRow;
}

export interface ActionEventValidationIssue {
  readonly path: string;
  readonly message: string;
}

export class ActionEventInvalidError extends DomainError {
  readonly issues: readonly ActionEventValidationIssue[];

  constructor(issues: readonly ActionEventValidationIssue[]) {
    super(
      "ACTION_EVENT_INVALID",
      `Action event is invalid: ${issues
        .map((issue) => `${issue.path} ${issue.message}`)
        .join("; ")}`,
      { issues },
    );
    this.issues = issues;
  }
}

const uuidSchema = z.uuid();
const reactionValueSchema = z.union([
  z.literal(-1),
  z.literal(0),
  z.literal(1),
]);

interface DimensionRule {
  readonly targetTypes: readonly ActionEventTargetType[];
  readonly requiresSociety: boolean;
  readonly requiresThread: boolean;
  readonly requiresComment: boolean;
  readonly requiresReport: boolean;
}

const DIMENSION_RULES: Record<ActionEventType, DimensionRule> = {
  thread_created: { targetTypes: ["thread"], requiresSociety: true, requiresThread: true, requiresComment: false, requiresReport: false },
  thread_edited: { targetTypes: ["thread"], requiresSociety: true, requiresThread: true, requiresComment: false, requiresReport: false },
  thread_deleted: { targetTypes: ["thread"], requiresSociety: true, requiresThread: true, requiresComment: false, requiresReport: false },
  comment_created: { targetTypes: ["comment"], requiresSociety: true, requiresThread: true, requiresComment: true, requiresReport: false },
  comment_edited: { targetTypes: ["comment"], requiresSociety: true, requiresThread: true, requiresComment: true, requiresReport: false },
  comment_deleted: { targetTypes: ["comment"], requiresSociety: true, requiresThread: true, requiresComment: true, requiresReport: false },
  thread_reaction_changed: { targetTypes: ["thread"], requiresSociety: true, requiresThread: true, requiresComment: false, requiresReport: false },
  comment_reaction_changed: { targetTypes: ["comment"], requiresSociety: true, requiresThread: true, requiresComment: true, requiresReport: false },
  society_membership_joined: { targetTypes: ["society"], requiresSociety: true, requiresThread: false, requiresComment: false, requiresReport: false },
  society_membership_left: { targetTypes: ["society"], requiresSociety: true, requiresThread: false, requiresComment: false, requiresReport: false },
  society_membership_activated: { targetTypes: ["society"], requiresSociety: true, requiresThread: false, requiresComment: false, requiresReport: false },
  society_membership_banned: { targetTypes: ["society"], requiresSociety: true, requiresThread: false, requiresComment: false, requiresReport: true },
  report_created: { targetTypes: ["report"], requiresSociety: true, requiresThread: false, requiresComment: false, requiresReport: true },
  moderation_report_decided: { targetTypes: ["report"], requiresSociety: true, requiresThread: false, requiresComment: false, requiresReport: true },
  moderation_content_removed: { targetTypes: ["thread", "comment"], requiresSociety: true, requiresThread: true, requiresComment: false, requiresReport: true },
};

const actionEventInputSchema = z
  .object({
    eventId: uuidSchema,
    eventType: z.enum(ACTION_EVENT_TYPES),
    schemaVersion: z.literal(ACTION_EVENT_SCHEMA_VERSION),
    actorUserId: uuidSchema,
    actorPlatformRole: z.enum(["student", "system_admin"]),
    actorSocietyRole: z.enum(["member", "moderator"]).nullable(),
    occurredAt: z.date(),
    targetType: z.enum(ACTION_EVENT_TARGET_TYPES),
    targetId: uuidSchema,
    societyId: uuidSchema.nullable(),
    threadId: uuidSchema.nullable(),
    commentId: uuidSchema.nullable(),
    reportId: uuidSchema.nullable(),
    correlationId: z.string().min(1).max(MAX_CORRELATION_ID_LENGTH),
    fromReaction: reactionValueSchema.nullable(),
    toReaction: reactionValueSchema.nullable(),
    metadata: z.unknown(),
  })
  .superRefine((event, context) => {
    const addIssue = (path: string, message: string) => {
      context.addIssue({ code: "custom", path: [path], message });
    };

    const metadataResult =
      actionEventMetadataSchemas[event.eventType].safeParse(event.metadata);
    if (!metadataResult.success) {
      addIssue(
        "metadata",
        `does not match the ${event.eventType} metadata schema`,
      );
    }

    const rule = DIMENSION_RULES[event.eventType];

    if (!rule.targetTypes.includes(event.targetType)) {
      addIssue(
        "targetType",
        `must be ${rule.targetTypes.join(" or ")} for ${event.eventType}`,
      );
    }
    if (rule.requiresSociety && event.societyId === null) {
      addIssue("societyId", `is required for ${event.eventType}`);
    }
    if (rule.requiresThread && event.threadId === null) {
      addIssue("threadId", `is required for ${event.eventType}`);
    }
    if (rule.requiresComment && event.commentId === null) {
      addIssue("commentId", `is required for ${event.eventType}`);
    }
    if (rule.requiresReport && event.reportId === null) {
      addIssue("reportId", `is required for ${event.eventType}`);
    }

    // Reported content and removed content carry the content dimensions of
    // the affected thread/comment, including the parent thread of a comment.
    if (event.eventType === "report_created" && metadataResult.success) {
      const reportedTargetType = (
        metadataResult.data as { reportedTargetType: "thread" | "comment" }
      ).reportedTargetType;
      if (reportedTargetType === "thread" && event.threadId === null) {
        addIssue("threadId", "is required when a thread is reported");
      }
      if (
        reportedTargetType === "comment" &&
        (event.threadId === null || event.commentId === null)
      ) {
        addIssue(
          "threadId",
          "and commentId are required when a comment is reported",
        );
      }
    }
    if (
      event.eventType === "moderation_content_removed" &&
      event.targetType === "comment" &&
      event.commentId === null
    ) {
      addIssue("commentId", "is required when a comment is removed");
    }

    const isReactionEvent = (
      REACTION_EVENT_TYPES as readonly string[]
    ).includes(event.eventType);
    if (isReactionEvent) {
      if (event.fromReaction === null || event.toReaction === null) {
        addIssue("fromReaction", "and toReaction are required for reaction events");
      } else if (event.fromReaction === event.toReaction) {
        addIssue(
          "toReaction",
          "must differ from fromReaction; a no-op reaction emits no event",
        );
      }
    } else if (event.fromReaction !== null || event.toReaction !== null) {
      addIssue(
        "fromReaction",
        "must be null for non-reaction events",
      );
    }

    const encodedMetadata = JSON.stringify(event.metadata) ?? "";
    if (Buffer.byteLength(encodedMetadata, "utf8") > MAX_ACTION_EVENT_METADATA_BYTES) {
      addIssue(
        "metadata",
        `encoded size must be at most ${MAX_ACTION_EVENT_METADATA_BYTES} bytes`,
      );
    }
  });

/** Validates a candidate event against the exact v1 catalog. */
export function validateActionEvent<E extends ActionEventType>(
  event: ActionEventInput<E>,
): ActionEventInput<E> {
  const result = actionEventInputSchema.safeParse(event);

  if (!result.success) {
    throw new ActionEventInvalidError(
      result.error.issues.map((issue) => ({
        path: issue.path.map(String).join(".") || "event",
        message: issue.message,
      })),
    );
  }

  return event;
}

/** Checks only the shared byte budget; event-typed rules live above. */
export function metadataEncodedSize(metadata: ActionEventMetadata): number {
  return Buffer.byteLength(JSON.stringify(metadata) ?? "", "utf8");
}
