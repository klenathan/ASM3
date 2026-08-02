import type { PublicUserDto, UserDto } from "./identity.dto";
import type { IdentityAccountRecord } from "../domain/identity.types";

export function toUserDto(account: IdentityAccountRecord): UserDto {
  return {
    userId: account.user.id,
    email: account.user.email,
    displayName: account.profile.displayName,
    bio: account.profile.bio,
    avatarMediaId: account.profile.avatarMediaId,
    platformRole: account.profile.platformRole,
    status: account.profile.status,
    isPublic: account.profile.isPublic,
    suspendedUntil: account.profile.suspendedUntil?.toISOString() ?? null,
    createdAt: account.profile.createdAt.toISOString(),
    updatedAt: account.profile.updatedAt.toISOString(),
  };
}

export function toPublicUserDto(
  account: IdentityAccountRecord,
  isOwner: boolean,
): PublicUserDto {
  return {
    userId: account.user.id,
    displayName: account.profile.displayName,
    bio: account.profile.bio,
    avatarMediaId: account.profile.avatarMediaId,
    platformRole: account.profile.platformRole,
    status: account.profile.status,
    isPublic: account.profile.isPublic,
    isOwner,
    createdAt: account.profile.createdAt.toISOString(),
  };
}
