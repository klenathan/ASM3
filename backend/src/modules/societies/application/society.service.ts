import { randomUUID } from "node:crypto";

import type { Clock } from "../../../shared/application/clock";
import type { TransactionManager } from "../../../shared/application/transaction";
import { ApplicationError } from "../../../shared/domain/errors";
import { normalizePageSize, type PageRequest } from "../../../shared/application/pagination";
import type { RequestPrincipal } from "../../../shared/presentation/request-principal";
import { isActiveModerator } from "../domain/membership";
import {
  assertActiveSociety,
  normalizeAvatarMediaId,
  normalizeRuleDescription,
  normalizeRulePosition,
  normalizeRuleTitle,
  normalizeSlug,
  normalizeSlugForLookup,
  normalizeSocietyDescription,
  normalizeSocietyName,
  type SocietyRecord,
} from "../domain/society";
import type {
  CreateRuleCommand,
  CreateSocietyCommand,
  RuleDto,
  SocietyDiscoveryQuery,
  SocietyDto,
  SocietyPageDto,
  UpdateRuleCommand,
} from "./society.dto";
import { toRuleDto, toSocietyDto, toSocietyPageDto } from "./society.mappers";
import type { MembershipRepository } from "./membership.repository";
import type { SocietyRepository, UpdateRuleInput } from "./society.repository";

export interface SocietyServiceDependencies {
  readonly repository: SocietyRepository;
  readonly membershipRepository: MembershipRepository;
  readonly transactions: TransactionManager<SocietyRepository>;
  readonly clock: Clock;
}

export class SocietyService {
  private readonly repository: SocietyRepository;
  private readonly membershipRepository: MembershipRepository;
  private readonly transactions: TransactionManager<SocietyRepository>;
  private readonly clock: Clock;

  constructor(dependencies: SocietyServiceDependencies) {
    this.repository = dependencies.repository;
    this.membershipRepository = dependencies.membershipRepository;
    this.transactions = dependencies.transactions;
    this.clock = dependencies.clock;
  }

  async createSociety(
    principal: RequestPrincipal,
    command: CreateSocietyCommand,
  ): Promise<SocietyDto> {
    this.assertSystemAdmin(principal);

    const now = this.clock.now();
    const created = await this.transactions.withTransaction((repository) =>
      repository.createSociety({
        id: randomUUID(),
        slug: normalizeSlug(command.slug),
        name: normalizeSocietyName(command.name),
        description: normalizeSocietyDescription(command.description),
        avatarMediaId: normalizeAvatarMediaId(command.avatarMediaId),
        createdBy: principal.userId,
        createdAt: now,
        updatedAt: now,
      }),
    );

    return toSocietyDto(created);
  }

  async discover(
    query: SocietyDiscoveryQuery & PageRequest,
    principal?: RequestPrincipal,
  ): Promise<SocietyPageDto> {
    const limit = normalizePageSize(query.limit);
    const normalizedPage: SocietyDiscoveryQuery & PageRequest = {
      limit,
      ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
      ...(query.q === undefined || query.q.trim() === "" ? {} : { q: query.q.trim() }),
    };
    const page = await this.repository.listSocieties(normalizedPage);

    if (principal === undefined) {
      return toSocietyPageDto(page);
    }

    const memberships = await this.membershipRepository.findActiveMembershipsByUser(principal.userId);
    const bySocietyId = new Map(memberships.map((item) => [item.societyId, item] as const));
    return toSocietyPageDto(page, bySocietyId);
  }

  async listSocieties(
    query: SocietyDiscoveryQuery & PageRequest,
    principal?: RequestPrincipal,
  ): Promise<SocietyPageDto> {
    return this.discover(query, principal);
  }

  async getSociety(slug: string): Promise<SocietyDto> {
    return toSocietyDto(await this.societyBySlugOrThrow(slug));
  }

  async listRules(slug: string): Promise<readonly RuleDto[]> {
    const society = await this.societyBySlugOrThrow(slug);
    const rules = await this.repository.listRules(society.id);
    return rules.map(toRuleDto);
  }

  async getRule(slug: string, ruleId: string): Promise<RuleDto> {
    const society = await this.societyBySlugOrThrow(slug);
    const rule = await this.repository.findRuleById(society.id, ruleId);
    if (rule === null) {
      throw new ApplicationError("NOT_FOUND", "Society rule was not found");
    }

    return toRuleDto(rule);
  }

  async createRule(
    principal: RequestPrincipal,
    slug: string,
    command: CreateRuleCommand,
  ): Promise<RuleDto> {
    const society = await this.authorizeSocietyChange(principal, slug);
    const now = this.clock.now();
    const rule = await this.transactions.withTransaction((repository) =>
      repository.createRule({
        id: randomUUID(),
        societyId: society.id,
        position: normalizeRulePosition(command.position),
        title: normalizeRuleTitle(command.title),
        description: normalizeRuleDescription(command.description),
        createdAt: now,
        updatedAt: now,
      }),
    );

    return toRuleDto(rule);
  }

  async updateRule(
    principal: RequestPrincipal,
    slug: string,
    ruleId: string,
    command: UpdateRuleCommand,
  ): Promise<RuleDto> {
    const society = await this.authorizeSocietyChange(principal, slug);
    const current = await this.repository.findRuleById(society.id, ruleId);
    if (current === null) {
      throw new ApplicationError("NOT_FOUND", "Society rule was not found");
    }

    const input = this.ruleUpdateInput(command);
    if (Object.keys(input).length === 1) {
      return toRuleDto(current);
    }

    const updated = await this.transactions.withTransaction((repository) =>
      repository.updateRule(society.id, ruleId, input),
    );
    if (updated === null) {
      throw new ApplicationError("NOT_FOUND", "Society rule was not found");
    }

    return toRuleDto(updated);
  }

  async deleteRule(principal: RequestPrincipal, slug: string, ruleId: string): Promise<void> {
    const society = await this.authorizeSocietyChange(principal, slug);
    const deleted = await this.transactions.withTransaction((repository) =>
      repository.deleteRule(society.id, ruleId),
    );
    if (!deleted) {
      throw new ApplicationError("NOT_FOUND", "Society rule was not found");
    }
  }

  private async authorizeSocietyChange(
    principal: RequestPrincipal,
    slug: string,
  ): Promise<SocietyRecord> {
    const society = await this.societyBySlugOrThrow(slug);
    assertActiveSociety(society);

    if (principal.platformRole === "system_admin") {
      return society;
    }

    const membership = await this.membershipRepository.findMembership(
      society.id,
      principal.userId,
    );
    if (!isActiveModerator(membership)) {
      throw new ApplicationError("SOCIETY_FORBIDDEN", "You cannot moderate this society");
    }

    return society;
  }

  private async societyBySlugOrThrow(slug: string): Promise<SocietyRecord> {
    const society = await this.repository.findSocietyBySlug(normalizeSlugForLookup(slug));
    if (society === null) {
      throw new ApplicationError("NOT_FOUND", "Society was not found");
    }

    return society;
  }

  private assertSystemAdmin(principal: RequestPrincipal): void {
    if (principal.platformRole !== "system_admin") {
      throw new ApplicationError("SOCIETY_FORBIDDEN", "System-admin access is required");
    }
  }

  private ruleUpdateInput(command: UpdateRuleCommand): UpdateRuleInput {
    const input: UpdateRuleInput = {
      updatedAt: this.clock.now(),
      ...(command.position === undefined
        ? {}
        : { position: normalizeRulePosition(command.position) }),
      ...(command.title === undefined ? {} : { title: normalizeRuleTitle(command.title) }),
      ...(command.description === undefined
        ? {}
        : { description: normalizeRuleDescription(command.description) }),
    };

    return input;
  }
}
