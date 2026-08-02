export type PlatformRole = "student" | "system_admin";

export type UserStatus = "active" | "suspended" | "deactivated";

export interface AuthUserRecord {
  readonly id: string;
  readonly email: string;
  readonly createdAt: Date;
}

export interface UserProfileRecord {
  readonly userId: string;
  readonly displayName: string;
  readonly bio: string | null;
  readonly avatarMediaId: string | null;
  readonly platformRole: PlatformRole;
  readonly status: UserStatus;
  readonly isPublic: boolean;
  readonly suspendedUntil: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface IdentityAccountRecord {
  readonly user: AuthUserRecord;
  readonly profile: UserProfileRecord;
}

export interface AuthSessionRecord {
  readonly id: string;
  readonly userId: string;
  readonly expiresAt: Date;
  readonly createdAt: Date;
}
