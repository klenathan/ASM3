import type { Clock } from "../../../shared/application/clock";
import type { TransactionManager } from "../../../shared/application/transaction";
import { ApplicationError } from "../../../shared/domain/errors";
import type { RequestPrincipal } from "../../../shared/presentation/request-principal";
import { assertAccountUsable, assertTargetExists } from "../domain/access.policy";
import { normalizeBio, normalizeDisplayName } from "../domain/registration.policy";
import type { AvatarMediaPort } from "./avatar-media.port";
import type { PublicUserDto, UpdateProfileCommand, UserDto } from "./identity.dto";
import { toPublicUserDto, toUserDto } from "./identity.mappers";
import type { IdentityRepository } from "./identity.repository";

export interface UserServiceDependencies {
  readonly repository: IdentityRepository;
  readonly transactions: TransactionManager<IdentityRepository>;
  readonly clock: Clock;
  readonly avatarMedia: AvatarMediaPort | undefined;
}

export class UserService {
  private readonly repository: IdentityRepository;
  private readonly transactions: TransactionManager<IdentityRepository>;
  private readonly clock: Clock;
  private readonly avatarMedia: AvatarMediaPort | undefined;

  constructor(dependencies: UserServiceDependencies) {
    this.repository = dependencies.repository;
    this.transactions = dependencies.transactions;
    this.clock = dependencies.clock;
    this.avatarMedia = dependencies.avatarMedia;
  }

  async getProfile(principal: RequestPrincipal): Promise<UserDto> {
    const account = await this.accountForPrincipal(principal);
    return toUserDto(account);
  }

  async updateProfile(
    principal: RequestPrincipal,
    command: UpdateProfileCommand,
  ): Promise<UserDto> {
    const account = await this.accountForPrincipal(principal);
    const input = {
      updatedAt: this.clock.now(),
      ...(command.displayName === undefined
        ? {}
        : { displayName: normalizeDisplayName(command.displayName) }),
      ...(command.bio === undefined ? {} : { bio: normalizeBio(command.bio) }),
      ...(command.avatarMediaId === undefined ? {} : { avatarMediaId: command.avatarMediaId }),
      ...(command.isPublic === undefined ? {} : { isPublic: command.isPublic }),
    };

    if (Object.keys(input).length === 1) {
      return toUserDto(account);
    }

    if (
      command.avatarMediaId !== undefined
      && command.avatarMediaId !== null
      && this.avatarMedia !== undefined
    ) {
      await this.avatarMedia.assertAvatarReadyForOwner(
        principal.userId,
        command.avatarMediaId,
      );
    }

    return toUserDto(
      await this.transactions.withTransaction(async (repository) => {
        await repository.updateProfile(principal.userId, input);
        const updatedAccount = await repository.findAccountByUserId(principal.userId);
        if (updatedAccount === null) {
          throw new ApplicationError("USER_NOT_FOUND", "User was not found");
        }

        return updatedAccount;
      }),
    );
  }

  async getPublicProfile(
    viewer: RequestPrincipal | undefined,
    userId: string,
  ): Promise<PublicUserDto> {
    const account = await this.repository.findAccountByUserId(userId);
    assertTargetExists(account);
    return toPublicUserDto(account, viewer?.userId === userId);
  }

  private async accountForPrincipal(principal: RequestPrincipal) {
    const account = await this.repository.findAccountByUserId(principal.userId);
    if (account === null) {
      throw new ApplicationError("AUTH_REQUIRED", "Authentication is required");
    }

    assertAccountUsable(account, this.clock.now());
    return account;
  }
}
