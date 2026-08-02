import type { PageResult } from "../../../shared/application/pagination.js";

export interface SocietyDto {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly status: "active" | "archived";
  readonly createdBy: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type SocietyPageDto = PageResult<SocietyDto>;

export interface CreateSocietyCommand {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
}

export interface RuleDto {
  readonly id: string;
  readonly societyId: string;
  readonly position: number;
  readonly title: string;
  readonly description: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreateRuleCommand {
  readonly position: number;
  readonly title: string;
  readonly description: string;
}

export interface UpdateRuleCommand {
  readonly position?: number;
  readonly title?: string;
  readonly description?: string;
}

export interface MembershipDto {
  readonly societyId: string;
  readonly userId: string;
  readonly role: "member" | "moderator";
  readonly status: "active" | "left" | "banned";
  readonly joinedAt: string;
  readonly updatedAt: string;
  readonly bannedBy: string | null;
  readonly bannedAt: string | null;
}

export interface AddModeratorCommand {
  readonly userId: string;
}
