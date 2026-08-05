/**
 * Context port for rehydrating authoritative thread-analysis context.
 * Implemented by the Discussions, Media, and Societies modules. The
 * content-analysis module never queries another module's concrete tables.
 */
export interface ThreadAnalysisContext {
  threadId: string;
  title: string;
  body: string;
  status: "published" | "removed" | "deleted";
  globalPolicy: string;
  societyRules: Array<{ id: string; title: string; description: string }>;
  images: Array<{ bucket: string; key: string; contentType: string; byteSize: number }>;
}

/**
 * Minimal, authoritative snapshot of a thread surfaced for enforcement
 * decisions. Includes only the fields needed to decide whether to remove: the
 * thread identity, its owning society, its author, and its current status.
 */
export interface ThreadAnalysisSnapshot {
  readonly threadId: string;
  readonly societyId: string;
  readonly authorId: string;
  readonly status: "published" | "removed" | "deleted";
}

export interface ThreadAnalysisContextPort {
  loadThreadContext(threadId: string): Promise<ThreadAnalysisContext>;
  loadThreadSnapshot(threadId: string): Promise<ThreadAnalysisSnapshot>;
}
