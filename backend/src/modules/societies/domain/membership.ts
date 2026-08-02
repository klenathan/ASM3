import { ApplicationError } from "../../../shared/domain/errors.js";

export type MembershipRole = "member" | "moderator";
export type MembershipStatus = "active" | "left" | "banned";

export interface MembershipRecord {
  readonly societyId: string;
  readonly userId: string;
  readonly role: MembershipRole;
  readonly status: MembershipStatus;
  readonly joinedAt: Date;
  readonly updatedAt: Date;
  readonly bannedBy: string | null;
  readonly bannedAt: Date | null;
}

export function isActiveMember(
  membership: MembershipRecord | null,
): membership is MembershipRecord & { readonly status: "active" } {
  return membership?.status === "active";
}

export function isActiveModerator(
  membership: MembershipRecord | null,
): membership is MembershipRecord & {
  readonly status: "active";
  readonly role: "moderator";
} {
  return membership?.status === "active" && membership.role === "moderator";
}

export function assertModeratorCanBeRemoved(activeModeratorCount: number): void {
  if (activeModeratorCount <= 1) {
    throw new ApplicationError(
      "CONFLICT",
      "A society must retain at least one active moderator",
    );
  }
}

export function assertMembershipState(value: string): MembershipStatus {
  if (value !== "active" && value !== "left" && value !== "banned") {
    throw new ApplicationError("SOCIETY_DATA_INVALID", "The membership contains invalid state");
  }

  return value;
}

export function assertMembershipRole(value: string): MembershipRole {
  if (value !== "member" && value !== "moderator") {
    throw new ApplicationError("SOCIETY_DATA_INVALID", "The membership contains invalid role");
  }

  return value;
}
