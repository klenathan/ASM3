import type { Database } from "../../db/client";
import { ALLOWED_EMAIL_DOMAINS } from "../../config/email-domains";
import { systemClock, type Clock } from "../../shared/application/clock";
import type { ConfigReader } from "../platform/application/config-reader";
import { AdminUserService } from "./application/admin-user.service";
import { AuthService } from "./application/auth.service";
import { UserService } from "./application/user.service";
import type { PasswordAdapter } from "./application/password.adapter";
import type { SessionTokenAdapter } from "./application/session.adapter";
import type { AvatarMediaPort } from "./application/avatar-media.port";
import { DrizzleIdentityRepository, DrizzleIdentityTransactionManager } from "./infrastructure/drizzle-identity.repository";
import { DrizzlePasswordCredentialStore, LocalPasswordAdapter } from "./infrastructure/local-password.adapter";
import { OpaqueSessionAdapter } from "./infrastructure/opaque-session.adapter";

export interface IdentityModuleDependencies {
  readonly database: Database;
  readonly clock?: Clock;
  readonly allowedEmailDomains?: readonly string[];
  readonly configReader?: ConfigReader;
  readonly passwordAdapter?: PasswordAdapter;
  readonly sessionAdapter?: SessionTokenAdapter;
  readonly avatarMedia?: AvatarMediaPort;
}

export function createIdentityModule(dependencies: IdentityModuleDependencies) {
  const repository = new DrizzleIdentityRepository(dependencies.database);
  const transactions = new DrizzleIdentityTransactionManager(dependencies.database);
  const clock = dependencies.clock ?? systemClock;
  const passwordAdapter = dependencies.passwordAdapter
    ?? new LocalPasswordAdapter(new DrizzlePasswordCredentialStore(dependencies.database));
  const sessionAdapter = dependencies.sessionAdapter ?? new OpaqueSessionAdapter();
  const allowedEmailDomains = dependencies.allowedEmailDomains ?? ALLOWED_EMAIL_DOMAINS;
  const avatarMedia: AvatarMediaPort | undefined = dependencies.avatarMedia;

  const authService = new AuthService({
    repository,
    transactions,
    passwordAdapter,
    sessionAdapter,
    clock,
    allowedEmailDomains,
    ...(dependencies.configReader === undefined ? {} : { configReader: dependencies.configReader }),
  });
  const userService = new UserService({ repository, transactions, clock, avatarMedia });
  const adminUserService = new AdminUserService({ repository, transactions, clock });

  return {
    repository,
    transactions,
    authService,
    userService,
    adminUserService,
  };
}

export { AuthService } from "./application/auth.service";
export { UserService } from "./application/user.service";
export { AdminUserService } from "./application/admin-user.service";
export { LocalPasswordAdapter, InMemoryPasswordCredentialStore, DrizzlePasswordCredentialStore } from "./infrastructure/local-password.adapter";
export { OpaqueSessionAdapter } from "./infrastructure/opaque-session.adapter";
export { DrizzleIdentityRepository, DrizzleIdentityTransactionManager } from "./infrastructure/drizzle-identity.repository";
export { registerIdentityRoutes } from "./presentation/identity.routes";
export type { IdentityRouteDependencies } from "./presentation/identity.routes";
export { sessionPrincipalMiddleware, extractSessionToken } from "./presentation/auth.middleware";
export type { IdentityRepository } from "./application/identity.repository";
export type { AvatarMediaPort } from "./application/avatar-media.port";
export type { PasswordAdapter, PasswordCredentialStore } from "./application/password.adapter";
export type { SessionTokenAdapter } from "./application/session.adapter";
export type {
  AuthResultDto,
  PublicUserDto,
  RegisterCommand,
  SetUserRoleCommand,
  SignInCommand,
  SuspendUserCommand,
  UpdateProfileCommand,
  UserDto,
  UserPageDto,
} from "./application/identity.dto";
export type { FindUsersFilter } from "./application/identity.repository";
