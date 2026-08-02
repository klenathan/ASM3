import type { MembershipRecord } from "../domain/membership";
import type { MembershipDto } from "./society.dto";

export function toMembershipDto(record: MembershipRecord): MembershipDto {
  return {
    societyId: record.societyId,
    userId: record.userId,
    role: record.role,
    status: record.status,
    joinedAt: record.joinedAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    bannedBy: record.bannedBy,
    bannedAt: record.bannedAt?.toISOString() ?? null,
  };
}
