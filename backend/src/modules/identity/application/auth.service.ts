import { randomUUID } from "node:crypto";

import type { Clock } from "../../../shared/application/clock";
import type { TransactionManager } from "../../../shared/application/transaction";
import { ApplicationError, DomainError } from "../../../shared/domain/errors";
import type { RequestPrincipal } from "../../../shared/presentation/request-principal";
import {
  assertAccountUsable,
} from "../domain/access.policy";
import {
  assertPasswordPolicy,
  assertRegistrationEmail,
  normalizeBio,
  normalizeDisplayName,
  normalizeEmail,
} from "../domain/registration.policy";
import type { IdentityAccountRecord } from "../domain/identity.types";
import type { AuthResultDto, RegisterCommand, SignInCommand, UserDto } from "./identity.dto";
import { toUserDto } from "./identity.mappers";
import type { IdentityRepository } from "./identity.repository";
import type { PasswordAdapter } from "./password.adapter";
import type { SessionTokenAdapter } from "./session.adapter";

const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 30;

export interface AuthServiceDependencies {
  readonly repository: IdentityRepository;
  readonly transactions: TransactionManager<IdentityRepository>;
  readonly passwordAdapter: PasswordAdapter;
  readonly sessionAdapter: SessionTokenAdapter;
  readonly clock: Clock;
  readonly allowedEmailDomains: readonly string[];
}

export class AuthService {
  private readonly repository: IdentityRepository;
  private readonly transactions: TransactionManager<IdentityRepository>;
  private readonly passwordAdapter: PasswordAdapter;
  private readonly sessionAdapter: SessionTokenAdapter;
  private readonly clock: Clock;
  private readonly allowedEmailDomains: readonly string[];

  constructor(dependencies: AuthServiceDependencies) {
    this.repository = dependencies.repository;
    this.transactions = dependencies.transactions;
    this.passwordAdapter = dependencies.passwordAdapter;
    this.sessionAdapter = dependencies.sessionAdapter;
    this.clock = dependencies.clock;
    this.allowedEmailDomains = dependencies.allowedEmailDomains;
  }

  async register(command: RegisterCommand): Promise<AuthResultDto> {
    const email = assertRegistrationEmail(command.email, this.allowedEmailDomains);
    assertPasswordPolicy(command.password);
    const displayName = normalizeDisplayName(command.displayName);
    const bio = normalizeBio(command.bio);
    const userId = randomUUID();
    const now = this.clock.now();
    const session = this.sessionAdapter.issue();
    const expiresAt = new Date(now.getTime() + SESSION_DURATION_MS);

    await this.passwordAdapter.setPassword(userId, command.password);

    try {
      const account = await this.transactions.withTransaction(async (repository) => {
        const existingUser = await repository.findUserByEmail(email);
        if (existingUser !== null) {
          throw new DomainError("EMAIL_ALREADY_REGISTERED", "An account already uses this email");
        }

        const user = await repository.createUser({ id: userId, email });
        await repository.createProfile({ userId: user.id, displayName, bio });
        await repository.createSession({
          id: session.hash,
          userId: user.id,
          expiresAt,
        });

        const createdAccount = await repository.findAccountByUserId(user.id);
        if (createdAccount === null) {
          throw new ApplicationError("IDENTITY_DATA_INVALID", "The account profile could not be created");
        }

        return createdAccount;
      });

      return this.authResult(account, session.token, expiresAt);
    } catch (error) {
      await this.passwordAdapter.removePassword(userId);
      throw error;
    }
  }

  async signIn(command: SignInCommand): Promise<AuthResultDto> {
    const email = normalizeEmail(command.email);
    const user = await this.repository.findUserByEmail(email);
    const passwordMatches = user !== null
      ? await this.passwordAdapter.verifyPassword(user.id, command.password)
      : false;

    if (user === null || !passwordMatches) {
      throw new ApplicationError("AUTH_INVALID_CREDENTIALS", "Email or password is incorrect");
    }

    const account = await this.repository.findAccountByUserId(user.id);
    if (account === null) {
      throw new ApplicationError("IDENTITY_DATA_INVALID", "The account profile could not be loaded");
    }

    const now = this.clock.now();
    assertAccountUsable(account, now);
    const session = this.sessionAdapter.issue();
    const expiresAt = new Date(now.getTime() + SESSION_DURATION_MS);

    await this.transactions.withTransaction(async (repository) => {
      await repository.createSession({ id: session.hash, userId: user.id, expiresAt });
    });

    return this.authResult(account, session.token, expiresAt);
  }

  async signOut(sessionToken: string): Promise<void> {
    if (sessionToken.trim().length === 0) {
      throw new ApplicationError("AUTH_REQUIRED", "Authentication is required");
    }

    await this.repository.deleteSessionById(this.sessionAdapter.hash(sessionToken));
  }

  async authenticateSession(sessionToken: string): Promise<RequestPrincipal> {
    if (sessionToken.trim().length === 0) {
      throw new ApplicationError("AUTH_REQUIRED", "Authentication is required");
    }

    const session = await this.repository.findSessionById(this.sessionAdapter.hash(sessionToken));
    if (session === null || session.expiresAt <= this.clock.now()) {
      throw new ApplicationError("AUTH_REQUIRED", "Authentication is required");
    }

    const account = await this.repository.findAccountByUserId(session.userId);
    if (account === null) {
      throw new ApplicationError("AUTH_REQUIRED", "Authentication is required");
    }

    assertAccountUsable(account, this.clock.now());

    return {
      userId: account.user.id,
      platformRole: account.profile.platformRole,
    };
  }

  async currentUser(principal: RequestPrincipal): Promise<UserDto> {
    const account = await this.accountForPrincipal(principal);
    return toUserDto(account);
  }

  private async accountForPrincipal(principal: RequestPrincipal): Promise<IdentityAccountRecord> {
    const account = await this.repository.findAccountByUserId(principal.userId);
    if (account === null) {
      throw new ApplicationError("AUTH_REQUIRED", "Authentication is required");
    }

    assertAccountUsable(account, this.clock.now());
    return account;
  }

  private authResult(
    account: IdentityAccountRecord,
    sessionToken: string,
    expiresAt: Date,
  ): AuthResultDto {
    return {
      user: toUserDto(account),
      sessionToken,
      expiresAt: expiresAt.toISOString(),
    };
  }
}
