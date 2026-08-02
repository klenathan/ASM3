import type { RequestPrincipal } from "../../../shared/presentation/request-principal";
import type { ProfileIdentity } from "./discussion.mappers";

/** Explicit identity-module boundary for discussion authorship and privacy. */
export interface DiscussionProfilePort {
  findPublicIdentity(userId: string): Promise<ProfileIdentity | null>;
  findPublicIdentities(userIds: readonly string[]): Promise<ReadonlyMap<string, ProfileIdentity>>;
  canReadActivityBy(
    viewer: RequestPrincipal | undefined,
    authorId: string,
  ): Promise<boolean>;
}
