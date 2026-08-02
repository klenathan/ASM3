import { ApplicationError } from "../../../shared/domain/errors.js";
import type { IdentityAccountRecord } from "./identity.types.js";

export function assertAccountUsable(account: IdentityAccountRecord, now: Date): void {
  if (account.profile.status === "deactivated") {
    throw new ApplicationError("USER_DEACTIVATED", "This account has been deactivated");
  }

  if (
    account.profile.status === "suspended" &&
    (account.profile.suspendedUntil === null || account.profile.suspendedUntil > now)
  ) {
    throw new ApplicationError("USER_SUSPENDED", "This account is suspended");
  }
}

export function assertSystemAdmin(account: IdentityAccountRecord): void {
  if (account.profile.platformRole !== "system_admin") {
    throw new ApplicationError("ADMIN_REQUIRED", "System-admin access is required");
  }
}

export function assertTargetExists(
  account: IdentityAccountRecord | null,
): asserts account is IdentityAccountRecord {
  if (account === null) {
    throw new ApplicationError("USER_NOT_FOUND", "User was not found");
  }
}
