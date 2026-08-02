import type { PlatformRole, UserStatus } from "../domain/identity.types";

export interface UserDto {
  readonly userId: string;
  readonly email: string;
  readonly displayName: string;
  readonly bio: string | null;
  readonly avatarMediaId: string | null;
  readonly platformRole: PlatformRole;
  readonly status: UserStatus;
  readonly isPublic: boolean;
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
  readonly isPublic?: boolean;
}

/**
 * A profile that may be viewed by visitors other than its owner.
 * When the profile is not public (and the viewer is not the owner) the
 * activity-bearing fields are hidden and the consumer renders a private state.
 */
export interface PublicUserDto {
  readonly userId: string;
  readonly displayName: string;
  readonly bio: string | null;
  readonly avatarMediaId: string | null;
  readonly platformRole: PlatformRole;
  readonly status: UserStatus;
  readonly isPublic: boolean;
  readonly isOwner: boolean;
  readonly createdAt: string;
}

export interface SuspendUserCommand {
  readonly suspendedUntil: Date | null;
}

export interface SetUserRoleCommand {
  readonly platformRole: PlatformRole;
}
