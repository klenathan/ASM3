import type { Database } from "../../db/client.js";
import { ALLOWED_EMAIL_DOMAINS } from "../../config/email-domains.js";
import { systemClock, type Clock } from "../../shared/application/clock.js";
import { AdminUserService } from "./application/admin-user.service.js";
import { AuthService } from "./application/auth.service.js";
import { UserService } from "./application/user.service.js";
import type { PasswordAdapter } from "./application/password.adapter.js";
import type { SessionTokenAdapter } from "./application/session.adapter.js";
import { DrizzleIdentityRepository, DrizzleIdentityTransactionManager } from "./infrastructure/drizzle-identity.repository.js";
import { LocalPasswordAdapter } from "./infrastructure/local-password.adapter.js";
import { OpaqueSessionAdapter } from "./infrastructure/opaque-session.adapter.js";

export interface IdentityModuleDependencies {
  readonly database: Database;
  readonly clock?: Clock;
  readonly allowedEmailDomains?: readonly string[];
  readonly passwordAdapter?: PasswordAdapter;
  readonly sessionAdapter?: SessionTokenAdapter;
}

export function createIdentityModule(dependencies: IdentityModuleDependencies) {
  const repository = new DrizzleIdentityRepository(dependencies.database);
  const transactions = new DrizzleIdentityTransactionManager(dependencies.database);
  const clock = dependencies.clock ?? systemClock;
  // The supplied auth schema has no password-hash field; inject a durable store before deployment.
  const passwordAdapter = dependencies.passwordAdapter ?? new LocalPasswordAdapter();
  const sessionAdapter = dependencies.sessionAdapter ?? new OpaqueSessionAdapter();
  const allowedEmailDomains = dependencies.allowedEmailDomains ?? ALLOWED_EMAIL_DOMAINS;

  const authService = new AuthService({
    repository,
    transactions,
    passwordAdapter,
    sessionAdapter,
    clock,
    allowedEmailDomains,
  });
  const userService = new UserService({ repository, transactions, clock });
  const adminUserService = new AdminUserService({ repository, transactions, clock });

  return {
    repository,
    transactions,
    authService,
    userService,
    adminUserService,
  };
}

export { AuthService } from "./application/auth.service.js";
export { UserService } from "./application/user.service.js";
export { AdminUserService } from "./application/admin-user.service.js";
export { LocalPasswordAdapter, InMemoryPasswordCredentialStore } from "./infrastructure/local-password.adapter.js";
export { OpaqueSessionAdapter } from "./infrastructure/opaque-session.adapter.js";
export { DrizzleIdentityRepository, DrizzleIdentityTransactionManager } from "./infrastructure/drizzle-identity.repository.js";
export { registerIdentityRoutes } from "./presentation/identity.routes.js";
export type { IdentityRouteDependencies } from "./presentation/identity.routes.js";
export { sessionPrincipalMiddleware, extractSessionToken } from "./presentation/auth.middleware.js";
export type { IdentityRepository } from "./application/identity.repository.js";
export type { PasswordAdapter, PasswordCredentialStore } from "./application/password.adapter.js";
export type { SessionTokenAdapter } from "./application/session.adapter.js";
export type {
  AuthResultDto,
  RegisterCommand,
  SetUserRoleCommand,
  SignInCommand,
  SuspendUserCommand,
  UpdateProfileCommand,
  UserDto,
} from "./application/identity.dto.js";
