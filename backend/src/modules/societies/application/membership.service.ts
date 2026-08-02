import type { Clock } from "../../../shared/application/clock";
import type { TransactionManager } from "../../../shared/application/transaction";
import { ApplicationError } from "../../../shared/domain/errors";
import type { RequestPrincipal } from "../../../shared/presentation/request-principal";
import {
  assertModeratorCanBeRemoved,
  isActiveMember,
  isActiveModerator,
} from "../domain/membership";
import { assertActiveSociety, type SocietyRecord } from "../domain/society";
import type { MembershipDto, AddModeratorCommand } from "./society.dto";
import { toMembershipDto } from "./membership.mappers";
import type {
  CreateMembershipInput,
  MembershipRepository,
} from "./membership.repository";
import type { SocietyRepository } from "./society.repository";

export interface MembershipServiceDependencies {
  readonly repository: MembershipRepository;
  readonly societyRepository: SocietyRepository;
  readonly transactions: TransactionManager<MembershipRepository>;
  readonly clock: Clock;
}

export class MembershipService {
  private readonly repository: MembershipRepository;
  private readonly societyRepository: SocietyRepository;
  private readonly transactions: TransactionManager<MembershipRepository>;
  private readonly clock: Clock;

  constructor(dependencies: MembershipServiceDependencies) {
    this.repository = dependencies.repository;
    this.societyRepository = dependencies.societyRepository;
    this.transactions = dependencies.transactions;
    this.clock = dependencies.clock;
  }

  async getMembership(
    principal: RequestPrincipal,
    societyId: string,
  ): Promise<MembershipDto | null> {
    await this.societyOrThrow(societyId);
    const membership = await this.repository.findMembership(societyId, principal.userId);
    return membership === null ? null : toMembershipDto(membership);
  }

  async hasActiveMembership(principal: RequestPrincipal, societyId: string): Promise<boolean> {
    const membership = await this.repository.findMembership(societyId, principal.userId);
    return isActiveMember(membership);
  }

  async requireActiveMembership(
    principal: RequestPrincipal,
    societyId: string,
  ): Promise<MembershipDto> {
    await this.societyOrThrow(societyId);
    const membership = await this.repository.findMembership(societyId, principal.userId);
    if (!isActiveMember(membership)) {
      throw new ApplicationError("SOCIETY_FORBIDDEN", "Active society membership is required");
    }

    return toMembershipDto(membership);
  }

  async join(principal: RequestPrincipal, societyId: string): Promise<MembershipDto> {
    const society = await this.societyOrThrow(societyId);
    assertActiveSociety(society);
    const now = this.clock.now();

    const membership = await this.transactions.withTransaction(async (repository) => {
      const current = await repository.findMembership(societyId, principal.userId);
      if (current?.status === "banned") {
        throw new ApplicationError("SOCIETY_FORBIDDEN", "You are banned from this society");
      }

      if (current?.status === "active") {
        return current;
      }

      if (current !== null) {
        const updated = await repository.updateMembership(societyId, principal.userId, {
          role: "member",
          status: "active",
          joinedAt: now,
          updatedAt: now,
          bannedBy: null,
          bannedAt: null,
        });
        if (updated === null) {
          throw new ApplicationError("NOT_FOUND", "Membership was not found");
        }

        return updated;
      }

      const input: CreateMembershipInput = {
        societyId,
        userId: principal.userId,
        role: "member",
        status: "active",
        joinedAt: now,
        updatedAt: now,
      };
      return repository.createMembership(input);
    });

    return toMembershipDto(membership);
  }

  async leave(principal: RequestPrincipal, societyId: string): Promise<void> {
    const society = await this.societyOrThrow(societyId);
    assertActiveSociety(society);
    const now = this.clock.now();

    await this.transactions.withTransaction(async (repository) => {
      const current = await repository.findMembership(societyId, principal.userId);
      if (current === null || current.status === "left") {
        throw new ApplicationError("NOT_FOUND", "Active membership was not found");
      }
      if (current.status === "banned") {
        throw new ApplicationError("SOCIETY_FORBIDDEN", "A banned member cannot leave this society");
      }

      if (current.role === "moderator") {
        assertModeratorCanBeRemoved(await repository.countActiveModerators(societyId));
      }

      const updated = await repository.updateMembership(societyId, principal.userId, {
        role: "member",
        status: "left",
        updatedAt: now,
      });
      if (updated === null) {
        throw new ApplicationError("NOT_FOUND", "Active membership was not found");
      }
    });
  }

  async addModerator(
    principal: RequestPrincipal,
    societyId: string,
    command: AddModeratorCommand,
  ): Promise<MembershipDto> {
    const society = await this.societyOrThrow(societyId);
    assertActiveSociety(society);
    await this.assertModeratorAuthority(principal, societyId);
    const now = this.clock.now();

    const membership = await this.transactions.withTransaction(async (repository) => {
      const current = await repository.findMembership(societyId, command.userId);
      if (current?.status === "banned") {
        throw new ApplicationError("SOCIETY_FORBIDDEN", "The user is banned from this society");
      }
      if (current?.status === "active" && current.role === "moderator") {
        return current;
      }

      if (current !== null) {
        const updated = await repository.updateMembership(societyId, command.userId, {
          role: "moderator",
          status: "active",
          ...(current.status === "left" ? { joinedAt: now } : {}),
          updatedAt: now,
          bannedBy: null,
          bannedAt: null,
        });
        if (updated === null) {
          throw new ApplicationError("NOT_FOUND", "Membership was not found");
        }

        return updated;
      }

      return repository.createMembership({
        societyId,
        userId: command.userId,
        role: "moderator",
        status: "active",
        joinedAt: now,
        updatedAt: now,
      });
    });

    return toMembershipDto(membership);
  }

  async removeModerator(
    principal: RequestPrincipal,
    societyId: string,
    userId: string,
  ): Promise<MembershipDto> {
    const society = await this.societyOrThrow(societyId);
    assertActiveSociety(society);
    await this.assertModeratorAuthority(principal, societyId);
    const now = this.clock.now();

    const membership = await this.transactions.withTransaction(async (repository) => {
      const current = await repository.findMembership(societyId, userId);
      if (!isActiveModerator(current)) {
        throw new ApplicationError("NOT_FOUND", "Active moderator membership was not found");
      }

      assertModeratorCanBeRemoved(await repository.countActiveModerators(societyId));
      const updated = await repository.updateMembership(societyId, userId, {
        role: "member",
        status: "active",
        updatedAt: now,
      });
      if (updated === null) {
        throw new ApplicationError("NOT_FOUND", "Active moderator membership was not found");
      }

      return updated;
    });

    return toMembershipDto(membership);
  }

  async hasModeratorAuthority(principal: RequestPrincipal, societyId: string): Promise<boolean> {
    if (principal.platformRole === "system_admin") {
      return true;
    }

    return isActiveModerator(
      await this.repository.findMembership(societyId, principal.userId),
    );
  }

  private async assertModeratorAuthority(
    principal: RequestPrincipal,
    societyId: string,
  ): Promise<void> {
    if (await this.hasModeratorAuthority(principal, societyId)) {
      return;
    }

    throw new ApplicationError("SOCIETY_FORBIDDEN", "You cannot moderate this society");
  }

  private async societyOrThrow(societyId: string): Promise<SocietyRecord> {
    const society = await this.societyRepository.findSocietyById(societyId);
    if (society === null) {
      throw new ApplicationError("NOT_FOUND", "Society was not found");
    }

    return society;
  }
}
