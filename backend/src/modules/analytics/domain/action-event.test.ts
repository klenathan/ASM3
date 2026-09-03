import { describe, expect, it } from "vitest";

import {
  validateActionEvent,
  type ActionEventInput,
} from "./action-event";
import { createHmacPseudonymizer } from "./pseudonymizer";

const baseEvent: ActionEventInput = {
  eventId: "123e4567-e89b-12d3-a456-426614174000",
  eventType: "thread_reaction_changed",
  schemaVersion: 1,
  actorUserId: "123e4567-e89b-12d3-a456-426614174001",
  actorPlatformRole: "student",
  actorSocietyRole: "member",
  occurredAt: new Date("2026-08-27T12:00:00.000Z"),
  targetType: "thread",
  targetId: "123e4567-e89b-12d3-a456-426614174002",
  societyId: "123e4567-e89b-12d3-a456-426614174003",
  threadId: "123e4567-e89b-12d3-a456-426614174002",
  commentId: null,
  reportId: null,
  correlationId: "request-1",
  fromReaction: 0,
  toReaction: 1,
  metadata: {},
};

describe("action event contract", () => {
  it("accepts a fully dimensioned reaction event", () => {
    expect(() => validateActionEvent(baseEvent)).not.toThrow();
  });

  it("rejects a reaction event without a changed reaction pair", () => {
    expect(() => validateActionEvent({ ...baseEvent, toReaction: 0 })).toThrow(
      "toReaction must differ from fromReaction",
    );
  });

  it("accepts valid society membership joined and left events with empty metadata", () => {
    const joinedEvent: ActionEventInput<"society_membership_joined"> = {
      eventId: "123e4567-e89b-12d3-a456-426614174010",
      eventType: "society_membership_joined",
      schemaVersion: 1,
      actorUserId: "123e4567-e89b-12d3-a456-426614174001",
      actorPlatformRole: "student",
      actorSocietyRole: null,
      occurredAt: new Date("2026-08-27T12:00:00.000Z"),
      targetType: "society",
      targetId: "123e4567-e89b-12d3-a456-426614174003",
      societyId: "123e4567-e89b-12d3-a456-426614174003",
      threadId: null,
      commentId: null,
      reportId: null,
      correlationId: "request-join-1",
      fromReaction: null,
      toReaction: null,
      metadata: {},
    };
    expect(() => validateActionEvent(joinedEvent)).not.toThrow();

    const leftEvent: ActionEventInput<"society_membership_left"> = {
      ...joinedEvent,
      eventId: "123e4567-e89b-12d3-a456-426614174011",
      eventType: "society_membership_left",
      actorSocietyRole: "member",
      metadata: {},
    };
    expect(() => validateActionEvent(leftEvent)).not.toThrow();
  });

  it("rejects society_membership_joined when metadata contains subjectRole", () => {
    const invalidJoinedEvent = {
      eventId: "123e4567-e89b-12d3-a456-426614174010",
      eventType: "society_membership_joined" as const,
      schemaVersion: 1 as const,
      actorUserId: "123e4567-e89b-12d3-a456-426614174001",
      actorPlatformRole: "student" as const,
      actorSocietyRole: null,
      occurredAt: new Date("2026-08-27T12:00:00.000Z"),
      targetType: "society" as const,
      targetId: "123e4567-e89b-12d3-a456-426614174003",
      societyId: "123e4567-e89b-12d3-a456-426614174003",
      threadId: null,
      commentId: null,
      reportId: null,
      correlationId: "request-join-1",
      fromReaction: null,
      toReaction: null,
      metadata: { subjectRole: "member" },
    };
    expect(() => validateActionEvent(invalidJoinedEvent as unknown as ActionEventInput)).toThrow(
      "metadata does not match the society_membership_joined metadata schema",
    );
  });

  it("produces deterministic, key-versioned pseudonyms without exposing user IDs", () => {
    const pseudonymizer = createHmacPseudonymizer(Buffer.alloc(32, 7), "v1");
    const first = pseudonymizer.pseudonymize(baseEvent.actorUserId);
    const second = pseudonymizer.pseudonymize(baseEvent.actorUserId);

    expect(first).toEqual(second);
    expect(first.pseudonym).toMatch(/^[0-9a-f]{64}$/);
    expect(first.pseudonym).not.toContain(baseEvent.actorUserId);
    expect(first.keyVersion).toBe("v1");
  });
});
