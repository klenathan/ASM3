import type { PageResult } from "../../../shared/application/pagination.js";
import type { SocietyRecord, SocietyRuleRecord } from "../domain/society.js";
import type { RuleDto, SocietyDto, SocietyPageDto } from "./society.dto.js";

export function toSocietyDto(record: SocietyRecord): SocietyDto {
  return {
    id: record.id,
    slug: record.slug,
    name: record.name,
    description: record.description,
    status: record.status,
    createdBy: record.createdBy,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function toSocietyPageDto(page: PageResult<SocietyRecord>): SocietyPageDto {
  return {
    items: page.items.map(toSocietyDto),
    nextCursor: page.nextCursor,
    hasMore: page.hasMore,
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
