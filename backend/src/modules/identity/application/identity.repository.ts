import type {
  AuthSessionRecord,
  AuthUserRecord,
  IdentityAccountRecord,
  PlatformRole,
  UserProfileRecord,
  UserStatus,
} from "../domain/identity.types";
import type { PageRequest, PageResult } from "../../../shared/application/pagination";

export interface CreateAuthUserInput {
  readonly id: string;
  readonly email: string;
  readonly passwordHash: string;
}

export interface CreateUserProfileInput {
  readonly userId: string;
  readonly displayName: string;
  readonly bio: string | null;
}

export interface UpdateUserProfileInput {
  readonly displayName?: string;
  readonly bio?: string | null;
  readonly avatarMediaId?: string | null;
  readonly isPublic?: boolean;
  readonly updatedAt: Date;
}

export interface UpdateUserAccessInput {
  readonly platformRole?: PlatformRole;
  readonly status?: UserStatus;
  readonly suspendedUntil?: Date | null;
  readonly updatedAt: Date;
}

export interface CreateSessionInput {
  readonly id: string;
  readonly userId: string;
  readonly expiresAt: Date;
}

export interface FindUsersFilter {
  readonly search?: string;
  readonly status?: UserStatus;
}

export interface IdentityRepository {
  findUserByEmail(email: string): Promise<AuthUserRecord | null>;
  findAccountByUserId(userId: string): Promise<IdentityAccountRecord | null>;
  findAccountsByUserIds(userIds: readonly string[]): Promise<readonly IdentityAccountRecord[]>;
  findUsers(page: PageRequest, filter?: FindUsersFilter): Promise<PageResult<IdentityAccountRecord>>;
  createUser(input: CreateAuthUserInput): Promise<AuthUserRecord>;
  createProfile(input: CreateUserProfileInput): Promise<UserProfileRecord>;
  updateProfile(userId: string, input: UpdateUserProfileInput): Promise<UserProfileRecord>;
  updateUserAccess(userId: string, input: UpdateUserAccessInput): Promise<UserProfileRecord>;
  createSession(input: CreateSessionInput): Promise<AuthSessionRecord>;
  findSessionById(id: string): Promise<AuthSessionRecord | null>;
  deleteSessionById(id: string): Promise<void>;
}
