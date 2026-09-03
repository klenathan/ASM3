import { z } from "zod";

import { ACTION_EVENT_TYPES } from "./action-event";

const eventCountsSchema = z.record(z.enum(ACTION_EVENT_TYPES), z.number().int().nonnegative());

export const activityMetricDataSchema = z.object({
  eventCounts: eventCountsSchema,
  distinctActors: z.number().int().nonnegative(),
  likesAdded: z.number().int().nonnegative(),
  likesRemoved: z.number().int().nonnegative(),
  dislikesAdded: z.number().int().nonnegative(),
  dislikesRemoved: z.number().int().nonnegative(),
  reactionScoreDelta: z.number().int(),
  joins: z.number().int().nonnegative(),
  leaves: z.number().int().nonnegative(),
  activations: z.number().int().nonnegative(),
  bans: z.number().int().nonnegative(),
  activeMembershipDelta: z.number().int(),
  firstActivityAt: z.string().datetime({ offset: true }).nullable(),
  lastActivityAt: z.string().datetime({ offset: true }).nullable(),
});

export const currentStateMetricDataSchema = z.object({
  snapshotAt: z.string().datetime({ offset: true }),
  positiveReactions: z.number().int().nonnegative(),
  negativeReactions: z.number().int().nonnegative(),
  reactionScore: z.number().int(),
  activeMemberships: z.number().int().nonnegative().nullable(),
});

export const reconciliationMetricDataSchema = z.object({
  status: z.enum(["matched", "mismatch", "not_comparable"]),
  previousSnapshotAt: z.string().datetime({ offset: true }).nullable(),
  currentSnapshotAt: z.string().datetime({ offset: true }),
  expected: z.number().int(),
  actual: z.number().int(),
  difference: z.number().int(),
});

export const actionMetricDataSchema = z.discriminatedUnion("metricKind", [
  z.object({ metricKind: z.literal("activity"), data: activityMetricDataSchema }),
  z.object({ metricKind: z.literal("current_state"), data: currentStateMetricDataSchema }),
  z.object({ metricKind: z.literal("reconciliation"), data: reconciliationMetricDataSchema }),
]);

export type ActivityMetricData = z.infer<typeof activityMetricDataSchema>;
export type CurrentStateMetricData = z.infer<typeof currentStateMetricDataSchema>;
export type ReconciliationMetricData = z.infer<typeof reconciliationMetricDataSchema>;
export type ActionMetricData = z.infer<typeof actionMetricDataSchema>;

export type ActionMetricGrain = "platform" | "society" | "content";
export type ActionMetricKind = ActionMetricData["metricKind"];

export interface ActionMetricRecord {
  readonly id: string;
  readonly contractVersion: 2;
  readonly metricKind: ActionMetricKind;
  readonly grain: ActionMetricGrain;
  readonly societyId: string | null;
  readonly targetType: "thread" | "comment" | null;
  readonly targetId: string | null;
  readonly threadId: string | null;
  readonly periodStart: Date;
  readonly periodEnd: Date;
  readonly snapshotAt: Date | null;
  readonly data: ActionMetricData;
  readonly refreshRunId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
