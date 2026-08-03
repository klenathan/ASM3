export interface AvatarMediaPort {
  assertAvatarReadyForOwner(ownerId: string, mediaId: string): Promise<void>;
}
