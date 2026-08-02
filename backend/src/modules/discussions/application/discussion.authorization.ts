import type { RequestPrincipal } from "../../../shared/presentation/request-principal.js";
import { ApplicationError } from "../../../shared/domain/errors.js";
import { isActiveMember, isActiveModerator } from "../../societies/domain/membership.js";
import { assertActiveSociety, type SocietyRecord } from "../../societies/domain/society.js";
import type { MembershipRepository } from "../../societies/application/membership.repository.js";
import type { SocietyRepository } from "../../societies/application/society.repository.js";

export interface DiscussionAuthorizationDependencies {
  readonly membershipRepository: MembershipRepository;
  readonly societyRepository: SocietyRepository;
}

export async function requireSociety(
  dependencies: DiscussionAuthorizationDependencies,
  societyId: string,
): Promise<SocietyRecord> {
  const society = await dependencies.societyRepository.findSocietyById(societyId);
  if (society === null) {
    throw new ApplicationError("NOT_FOUND", "Society was not found");
  }

  return society;
}

export async function requireActiveMember(
  dependencies: DiscussionAuthorizationDependencies,
  principal: RequestPrincipal,
  societyId: string,
): Promise<void> {
  const society = await requireSociety(dependencies, societyId);
  assertActiveSociety(society);
  const membership = await dependencies.membershipRepository.findMembership(
    societyId,
    principal.userId,
  );
  if (!isActiveMember(membership)) {
    throw new ApplicationError("SOCIETY_FORBIDDEN", "Active society membership is required");
  }
}

export async function hasSocietyModeratorAuthority(
  dependencies: DiscussionAuthorizationDependencies,
  principal: RequestPrincipal,
  societyId: string,
): Promise<boolean> {
  if (principal.platformRole === "system_admin") {
    return true;
  }

  return isActiveModerator(
    await dependencies.membershipRepository.findMembership(societyId, principal.userId),
  );
}

export async function assertMutationAuthority(
  dependencies: DiscussionAuthorizationDependencies,
  principal: RequestPrincipal,
  societyId: string,
  ownerId: string,
): Promise<void> {
  const society = await requireSociety(dependencies, societyId);
  assertActiveSociety(society);

  if (principal.platformRole === "system_admin" || principal.userId === ownerId) {
    return;
  }

  if (await hasSocietyModeratorAuthority(dependencies, principal, societyId)) {
    return;
  }

  throw new ApplicationError(
    "SOCIETY_FORBIDDEN",
    "Only the owner or a society moderator can change this content",
  );
}

export async function canReadRetained(
  dependencies: DiscussionAuthorizationDependencies,
  principal: RequestPrincipal | undefined,
  societyId: string,
  ownerId: string,
): Promise<boolean> {
  if (principal === undefined) {
    return false;
  }
  if (principal.platformRole === "system_admin" || principal.userId === ownerId) {
    return true;
  }

  return hasSocietyModeratorAuthority(dependencies, principal, societyId);
}
