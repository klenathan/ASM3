import { randomUUID } from "node:crypto";

import type { Clock } from "../../../shared/application/clock.js";
import type { TransactionManager } from "../../../shared/application/transaction.js";
import { ApplicationError } from "../../../shared/domain/errors.js";
import { normalizePageSize, type PageRequest } from "../../../shared/application/pagination.js";
import type { RequestPrincipal } from "../../../shared/presentation/request-principal.js";
import { isActiveModerator } from "../domain/membership.js";
import {
  assertActiveSociety,
  normalizeRuleDescription,
  normalizeRulePosition,
  normalizeRuleTitle,
  normalizeSlug,
  normalizeSocietyDescription,
  normalizeSocietyName,
} from "../domain/society.js";
import type {
  CreateRuleCommand,
  CreateSocietyCommand,
  RuleDto,
  SocietyDto,
  SocietyPageDto,
  UpdateRuleCommand,
} from "./society.dto.js";
import { toRuleDto, toSocietyDto, toSocietyPageDto } from "./society.mappers.js";
import type { MembershipRepository } from "./membership.repository.js";
import type { SocietyRepository, UpdateRuleInput } from "./society.repository.js";

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
        createdBy: principal.userId,
        createdAt: now,
        updatedAt: now,
      }),
    );

    return toSocietyDto(created);
  }

  async discover(page: PageRequest): Promise<SocietyPageDto> {
    const limit = normalizePageSize(page.limit);
    const normalizedPage: PageRequest = page.cursor === undefined
      ? { limit }
      : { limit, cursor: page.cursor };
    return toSocietyPageDto(await this.repository.listSocieties(normalizedPage));
  }

  async listSocieties(page: PageRequest): Promise<SocietyPageDto> {
    return this.discover(page);
  }

  async getSociety(societyId: string): Promise<SocietyDto> {
    return toSocietyDto(await this.societyOrThrow(societyId));
  }

  async listRules(societyId: string): Promise<readonly RuleDto[]> {
    await this.societyOrThrow(societyId);
    const rules = await this.repository.listRules(societyId);
    return rules.map(toRuleDto);
  }

  async getRule(societyId: string, ruleId: string): Promise<RuleDto> {
    await this.societyOrThrow(societyId);
    const rule = await this.repository.findRuleById(societyId, ruleId);
    if (rule === null) {
      throw new ApplicationError("NOT_FOUND", "Society rule was not found");
    }

    return toRuleDto(rule);
  }

  async createRule(
    principal: RequestPrincipal,
    societyId: string,
    command: CreateRuleCommand,
  ): Promise<RuleDto> {
    await this.authorizeSocietyChange(principal, societyId);
    const now = this.clock.now();
    const rule = await this.transactions.withTransaction((repository) =>
      repository.createRule({
        id: randomUUID(),
        societyId,
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
    societyId: string,
    ruleId: string,
    command: UpdateRuleCommand,
  ): Promise<RuleDto> {
    await this.authorizeSocietyChange(principal, societyId);
    const current = await this.repository.findRuleById(societyId, ruleId);
    if (current === null) {
      throw new ApplicationError("NOT_FOUND", "Society rule was not found");
    }

    const input = this.ruleUpdateInput(command);
    if (Object.keys(input).length === 1) {
      return toRuleDto(current);
    }

    const updated = await this.transactions.withTransaction((repository) =>
      repository.updateRule(societyId, ruleId, input),
    );
    if (updated === null) {
      throw new ApplicationError("NOT_FOUND", "Society rule was not found");
    }

    return toRuleDto(updated);
  }

  async deleteRule(principal: RequestPrincipal, societyId: string, ruleId: string): Promise<void> {
    await this.authorizeSocietyChange(principal, societyId);
    const deleted = await this.transactions.withTransaction((repository) =>
      repository.deleteRule(societyId, ruleId),
    );
    if (!deleted) {
      throw new ApplicationError("NOT_FOUND", "Society rule was not found");
    }
  }

  private async authorizeSocietyChange(
    principal: RequestPrincipal,
    societyId: string,
  ): Promise<void> {
    const society = await this.societyOrThrow(societyId);
    assertActiveSociety(society);

    if (principal.platformRole === "system_admin") {
      return;
    }

    const membership = await this.membershipRepository.findMembership(
      societyId,
      principal.userId,
    );
    if (!isActiveModerator(membership)) {
      throw new ApplicationError("SOCIETY_FORBIDDEN", "You cannot moderate this society");
    }
  }

  private async societyOrThrow(societyId: string) {
    const society = await this.repository.findSocietyById(societyId);
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
