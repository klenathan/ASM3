export interface ThreadMediaPort {
  assertReadyThreadAttachments(
    ownerId: string,
    mediaIds: readonly string[],
  ): Promise<void>;
}
