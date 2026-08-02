import type { PageRequest, PageResult } from "../../../shared/application/pagination";
import type { MembershipRecord } from "../domain/membership";
import type { SocietyRecord, SocietyRuleRecord } from "../domain/society";

export interface CreateSocietyInput {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly avatarMediaId: string;
  readonly createdBy: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateRuleInput {
  readonly id: string;
  readonly societyId: string;
  readonly position: number;
  readonly title: string;
  readonly description: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface UpdateRuleInput {
  readonly position?: number;
  readonly title?: string;
  readonly description?: string;
  readonly updatedAt: Date;
}

export interface MembershipSocietyRecord {
  readonly society: SocietyRecord;
  readonly membership: MembershipRecord;
}

export interface SocietyRepository {
  listSocieties(page: PageRequest & { readonly q?: string }): Promise<PageResult<SocietyRecord>>;
  listActiveMemberSocieties(userId: string): Promise<readonly MembershipSocietyRecord[]>;
  findSocietyById(societyId: string): Promise<SocietyRecord | null>;
  findSocietyBySlug(slug: string): Promise<SocietyRecord | null>;
  createSociety(input: CreateSocietyInput): Promise<SocietyRecord>;
  listRules(societyId: string): Promise<readonly SocietyRuleRecord[]>;
  findRuleById(societyId: string, ruleId: string): Promise<SocietyRuleRecord | null>;
  createRule(input: CreateRuleInput): Promise<SocietyRuleRecord>;
  updateRule(
    societyId: string,
    ruleId: string,
    input: UpdateRuleInput,
  ): Promise<SocietyRuleRecord | null>;
  deleteRule(societyId: string, ruleId: string): Promise<boolean>;
}
