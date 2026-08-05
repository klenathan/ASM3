import type { Clock } from "../../../shared/application/clock";
import { ApplicationError } from "../../../shared/domain/errors";
import type {
  ThreadAnalysisContext,
  ThreadAnalysisContextPort,
  ThreadAnalysisSnapshot,
} from "../application/thread-analysis-context.port";

/**
 * Minimal view of a thread needed to build an analysis request. Provided by
 * the Discussions module at the composition root; keeps the content-analysis
 * module independent of another module's concrete repository.
 */
export interface ThreadAnalysisContextThread {
  readonly societyId: string;
  readonly authorId: string;
  readonly title: string;
  readonly body: string | null;
  readonly status: "published" | "removed" | "deleted";
}

export interface ThreadAnalysisContextAsset {
  readonly id: string;
  readonly objectKey: string;
  readonly contentType: string;
  readonly byteSize: number;
}

export interface ThreadAnalysisContextRule {
  readonly id: string;
  readonly title: string;
  readonly description: string;
}

/**
 * Providers injected by the composition root. The adapter only depends on
 * these explicitly typed functions, never on another module's tables/repos.
 */
export interface ThreadAnalysisContextDeps {
  readonly findThread: (threadId: string) => Promise<ThreadAnalysisContextThread | null>;
  readonly listThreadMedia: (threadId: string) => Promise<readonly { readonly mediaId: string }[]>;
  readonly findMediaAssets: (
    mediaIds: readonly string[],
  ) => Promise<readonly ThreadAnalysisContextAsset[]>;
  readonly listSocietyRules: (
    societyId: string,
  ) => Promise<readonly ThreadAnalysisContextRule[]>;
  readonly readGlobalPolicy: () => Promise<string>;
  readonly mediaBucket: string;
  readonly maxImages: number;
  readonly clock: Clock;
}

/**
 * Rehydrates authoritative context for a new/updated thread: title, body,
 * current global policy, society rules, and ready attached images. Used by the
 * service before invoking the analysis Lambda.
 */
export class ThreadAnalysisContextAdapter implements ThreadAnalysisContextPort {
  readonly deps: ThreadAnalysisContextDeps;

  constructor(deps: ThreadAnalysisContextDeps) {
    this.deps = deps;
  }

  async loadThreadContext(threadId: string): Promise<ThreadAnalysisContext> {
    const thread = await this.deps.findThread(threadId);
    if (thread === null) {
      throw new ApplicationError("NOT_FOUND", "The thread was not found");
    }

    const ruleRecords = await this.deps.listSocietyRules(thread.societyId);
    const attachmentRecords = await this.deps.listThreadMedia(threadId);
    const mediaIds = attachmentRecords.map((record) => record.mediaId);
    const assets = await this.deps.findMediaAssets(mediaIds);

    const images = assets
      .slice(0, this.deps.maxImages)
      .map((asset) => ({
        bucket: this.deps.mediaBucket,
        key: asset.objectKey,
        contentType: asset.contentType,
        byteSize: asset.byteSize,
      }));

    const globalPolicy = await this.deps.readGlobalPolicy();

    return {
      threadId,
      title: thread.title,
      body: thread.body ?? "",
      status: thread.status,
      globalPolicy,
      societyRules: ruleRecords.map((rule) => ({
        id: rule.id,
        title: rule.title,
        description: rule.description,
      })),
      images,
    };
  }

  async loadThreadSnapshot(threadId: string): Promise<ThreadAnalysisSnapshot> {
    const thread = await this.deps.findThread(threadId);
    if (thread === null) {
      throw new ApplicationError("NOT_FOUND", "The thread was not found");
    }
    return {
      threadId,
      societyId: thread.societyId,
      authorId: thread.authorId,
      status: thread.status,
    };
  }
}
