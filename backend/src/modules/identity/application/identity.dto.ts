import type { PlatformRole, UserStatus } from "../domain/identity.types";

export interface UserDto {
  readonly userId: string;
  readonly email: string;
  readonly displayName: string;
  readonly bio: string | null;
  readonly avatarMediaId: string | null;
  readonly platformRole: PlatformRole;
  readonly status: UserStatus;
  readonly suspendedUntil: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AuthResultDto {
  readonly user: UserDto;
  readonly sessionToken: string;
  readonly expiresAt: string;
}

export interface RegisterCommand {
  readonly email: string;
  readonly password: string;
  readonly displayName: string;
  readonly bio?: string | null;
}

export interface SignInCommand {
  readonly email: string;
  readonly password: string;
}

export interface UpdateProfileCommand {
  readonly displayName?: string;
  readonly bio?: string | null;
  readonly avatarMediaId?: string | null;
}

export interface SuspendUserCommand {
  readonly suspendedUntil: Date | null;
}

export interface SetUserRoleCommand {
  readonly platformRole: PlatformRole;
}
