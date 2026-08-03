/**
 * Context port for rehydrating authoritative thread-analysis context.
 * Implemented by the Discussions, Media, and Societies modules. The
 * content-analysis module never queries another module's concrete tables.
 */
export interface ThreadAnalysisContext {
  threadId: string;
  title: string;
  body: string;
  globalPolicy: string;
  societyRules: Array<{ id: string; title: string; description: string }>;
  images: Array<{ bucket: string; key: string; contentType: string; byteSize: number }>;
}

export interface ThreadAnalysisContextPort {
  loadThreadContext(threadId: string): Promise<ThreadAnalysisContext>;
}
