export interface AttachMediaToThreadInput {
  readonly threadId: string;
  readonly ownerId: string;
  readonly mediaIds: readonly string[];
}

/**
 * The discussions module owns thread and thread_media persistence. Its adapter must verify that
 * ownerId is the thread author before writing the attachment rows.
 */
export interface ThreadAttachmentPort {
  attachMediaToThread(input: AttachMediaToThreadInput): Promise<void>;
}

export type MediaAttachmentPort = ThreadAttachmentPort;
