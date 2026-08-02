import type { UserDto } from "./identity.dto.js";
import type { IdentityAccountRecord } from "../domain/identity.types.js";

export function toUserDto(account: IdentityAccountRecord): UserDto {
  return {
    userId: account.user.id,
    email: account.user.email,
    displayName: account.profile.displayName,
    bio: account.profile.bio,
    avatarMediaId: account.profile.avatarMediaId,
    platformRole: account.profile.platformRole,
    status: account.profile.status,
    suspendedUntil: account.profile.suspendedUntil?.toISOString() ?? null,
    createdAt: account.profile.createdAt.toISOString(),
    updatedAt: account.profile.updatedAt.toISOString(),
  };
}
