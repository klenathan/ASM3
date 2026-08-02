import type { PageResult } from "../../../shared/application/pagination";
import type { MembershipRecord } from "../domain/membership";
import type { SocietyRecord, SocietyRuleRecord } from "../domain/society";
import type {
  RuleDto,
  SocietyDto,
  SocietyPageDto,
  SocietyMembershipSummary,
} from "./society.dto";

export function toSocietyDto(record: SocietyRecord): SocietyDto {
  return {
    id: record.id,
    slug: record.slug,
    name: record.name,
    description: record.description,
    avatarMediaId: record.avatarMediaId,
    status: record.status,
    createdBy: record.createdBy,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function toSocietyPageDto(
  page: PageResult<SocietyRecord>,
  membershipsBySocietyId: ReadonlyMap<string, MembershipRecord> = new Map(),
): SocietyPageDto {
  return {
    items: page.items.map((record) => {
      const membership = membershipsBySocietyId.get(record.id);
      return {
        ...toSocietyDto(record),
        membership: membership === undefined ? null : toMembershipSummary(membership),
      };
    }),
    nextCursor: page.nextCursor,
    hasMore: page.hasMore,
  };
}

function toMembershipSummary(membership: MembershipRecord): SocietyMembershipSummary {
  return {
    role: membership.role,
    status: membership.status,
  };
}

export function toRuleDto(record: SocietyRuleRecord): RuleDto {
  return {
    id: record.id,
    societyId: record.societyId,
    position: record.position,
    title: record.title,
    description: record.description,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
