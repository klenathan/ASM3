import type { MembershipRecord } from "../domain/membership.js";

export interface CreateMembershipInput {
  readonly societyId: string;
  readonly userId: string;
  readonly role: "member" | "moderator";
  readonly status: "active" | "left" | "banned";
  readonly joinedAt: Date;
  readonly updatedAt: Date;
}

export interface UpdateMembershipInput {
  readonly role?: "member" | "moderator";
  readonly status?: "active" | "left" | "banned";
  readonly joinedAt?: Date;
  readonly updatedAt: Date;
  readonly bannedBy?: string | null;
  readonly bannedAt?: Date | null;
}

export interface MembershipRepository {
  findMembership(societyId: string, userId: string): Promise<MembershipRecord | null>;
  countActiveModerators(societyId: string): Promise<number>;
  createMembership(input: CreateMembershipInput): Promise<MembershipRecord>;
  updateMembership(
    societyId: string,
    userId: string,
    input: UpdateMembershipInput,
  ): Promise<MembershipRecord | null>;
}
