import type { Clock } from "../../../shared/application/clock.js";
import type { TransactionManager } from "../../../shared/application/transaction.js";
import { ApplicationError } from "../../../shared/domain/errors.js";
import type { RequestPrincipal } from "../../../shared/presentation/request-principal.js";
import {
  assertAccountUsable,
  assertSystemAdmin,
  assertTargetExists,
} from "../domain/access.policy.js";
import type {
  SetUserRoleCommand,
  SuspendUserCommand,
  UserDto,
} from "./identity.dto.js";
import { toUserDto } from "./identity.mappers.js";
import type { IdentityRepository } from "./identity.repository.js";
import type { IdentityAccountRecord } from "../domain/identity.types.js";

export interface AdminUserServiceDependencies {
  readonly repository: IdentityRepository;
  readonly transactions: TransactionManager<IdentityRepository>;
  readonly clock: Clock;
}

export class AdminUserService {
  private readonly repository: IdentityRepository;
  private readonly transactions: TransactionManager<IdentityRepository>;
  private readonly clock: Clock;

  constructor(dependencies: AdminUserServiceDependencies) {
    this.repository = dependencies.repository;
    this.transactions = dependencies.transactions;
    this.clock = dependencies.clock;
  }

  async suspendUser(
    actor: RequestPrincipal,
    userId: string,
    command: SuspendUserCommand,
  ): Promise<UserDto> {
    const target = await this.authorize(actor, userId);
    const now = this.clock.now();
    if (command.suspendedUntil !== null && command.suspendedUntil <= now) {
      throw new ApplicationError("INVALID_SUSPENSION", "Suspension expiry must be in the future");
    }

    return this.updateAccess(target, {
      status: "suspended",
      suspendedUntil: command.suspendedUntil,
      updatedAt: now,
    });
  }

  async deactivateUser(actor: RequestPrincipal, userId: string): Promise<UserDto> {
    const target = await this.authorize(actor, userId);
    if (target.user.id === actor.userId) {
      throw new ApplicationError("SELF_ADMIN_ACTION_FORBIDDEN", "You cannot deactivate your own account");
    }

    return this.updateAccess(target, {
      status: "deactivated",
      suspendedUntil: null,
      updatedAt: this.clock.now(),
    });
  }

  async setRole(
    actor: RequestPrincipal,
    userId: string,
    command: SetUserRoleCommand,
  ): Promise<UserDto> {
    const target = await this.authorize(actor, userId);
    if (target.user.id === actor.userId && command.platformRole !== "system_admin") {
      throw new ApplicationError("SELF_ADMIN_ACTION_FORBIDDEN", "You cannot remove your own system-admin role");
    }

    return this.updateAccess(target, {
      platformRole: command.platformRole,
      updatedAt: this.clock.now(),
    });
  }

  private async authorize(actor: RequestPrincipal, targetUserId: string) {
    const actorAccount = await this.repository.findAccountByUserId(actor.userId);
    assertTargetExists(actorAccount);
    assertAccountUsable(actorAccount, this.clock.now());
    assertSystemAdmin(actorAccount);

    const target = await this.repository.findAccountByUserId(targetUserId);
    assertTargetExists(target);
    return target;
  }

  private async updateAccess(
    target: IdentityAccountRecord,
    input: Parameters<IdentityRepository["updateUserAccess"]>[1],
  ): Promise<UserDto> {
    return toUserDto(
      await this.transactions.withTransaction(async (repository) => {
        await repository.updateUserAccess(target.user.id, input);
        const updatedAccount = await repository.findAccountByUserId(target.user.id);
        assertTargetExists(updatedAccount);
        return updatedAccount;
      }),
    );
  }
}
