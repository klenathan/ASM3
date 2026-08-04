import { randomUUID } from "node:crypto";

import type { Clock } from "../../../shared/application/clock";
import { normalizePageSize } from "../../../shared/application/pagination";
import type { TransactionManager } from "../../../shared/application/transaction";
import { ApplicationError } from "../../../shared/domain/errors";
import type { RequestPrincipal } from "../../../shared/presentation/request-principal";
import {
  assertMutationAuthority,
  canReadRetained,
  hasSocietyModeratorAuthority,
  requireActiveMember,
  requireSociety,
  requireSocietyBySlug,
  type DiscussionAuthorizationDependencies,
} from "./discussion.authorization";
import type {
  CreateThreadCommand,
  ThreadDto,
  UpdateThreadCommand,
} from "./discussion.dto";
import type {
  AnalysisModerationAction,
} from "./discussion.dto";
import { toThreadDto } from "./discussion.mappers";
import type { DiscussionProfilePort } from "./discussion.profile";
import type { ThreadEventPublisher } from "./thread-events.port";
import type { ThreadMediaPort } from "./thread-media.port";
import type { AnalysisDecisionReader } from "./analysis-decision.reader";
import type { ThreadAnalysisDetailsReader } from "./analysis-details.reader";
import type { ThreadAnalysisDetails } from "../../content-analysis";
import type {
  CreateThreadInput,
  DiscussionRepository,
  UpdateThreadInput,
} from "./discussion.repository";
import {
  normalizeThreadBody,
  normalizeThreadTitle,
} from "../domain/discussion";

export interface AnalysisModerationPort {
  override(
    threadId: string,
    decision: "accept" | "reject",
    actorId: string,
    reason: string | null,
  ): Promise<void>;
  reanalyze(threadId: string): Promise<unknown>;
}

export interface ThreadServiceDependencies extends DiscussionAuthorizationDependencies {
  readonly repository: DiscussionRepository;
  readonly transactions: TransactionManager<DiscussionRepository>;
  readonly clock: Clock;
  readonly profile: DiscussionProfilePort;
  readonly media: ThreadMediaPort;
  readonly events: ThreadEventPublisher;
  /**
   * Optional read-only source of the latest automated content-analysis outcome
   * for a thread, used to surface a verification badge.
   */
  readonly analysisDecisionReader?: AnalysisDecisionReader;
  /**
   * Optional read-only source of the full analysis outcome for a single
   * thread, surfaced only to privileged moderators/system admins.
   */
  readonly threadAnalysisReader?: ThreadAnalysisDetailsReader;
  /**
   * Optional fire-and-forget hook invoked after a thread is committed and its
   * event published. Used to trigger downstream async work (e.g. content
   * analysis) without blocking thread creation.
   */
  readonly onThreadCreated?: (threadId: string) => void;
  /**
   * Optional content-analysis moderation actions (persist human override,
   * re-run analysis). Supplied by the content-analysis service; absent when
   * the backend runs without it configured.
   */
  readonly analysisModeration?: AnalysisModerationPort;
}

export class ThreadService {
  private readonly repository: DiscussionRepository;
  private readonly transactions: TransactionManager<DiscussionRepository>;
  private readonly clock: Clock;
  private readonly authorization: DiscussionAuthorizationDependencies;
  private readonly profile: DiscussionProfilePort;
  private readonly media: ThreadMediaPort;
  private readonly events: ThreadEventPublisher;
  private readonly onThreadCreated: ((threadId: string) => void) | undefined;
  private readonly analysisModeration: AnalysisModerationPort | undefined;
  private readonly analysisDecisionReader: AnalysisDecisionReader | undefined;
  private readonly threadAnalysisReader: ThreadAnalysisDetailsReader | undefined;

  constructor(dependencies: ThreadServiceDependencies) {
    this.repository = dependencies.repository;
    this.transactions = dependencies.transactions;
    this.clock = dependencies.clock;
    this.authorization = dependencies;
    this.profile = dependencies.profile;
    this.media = dependencies.media;
    this.events = dependencies.events;
    this.onThreadCreated = dependencies.onThreadCreated;
    this.analysisModeration = dependencies.analysisModeration;
    this.analysisDecisionReader = dependencies.analysisDecisionReader;
    this.threadAnalysisReader = dependencies.threadAnalysisReader;
  }

  async createThread(
    principal: RequestPrincipal,
    slug: string,
    command: CreateThreadCommand,
  ): Promise<ThreadDto> {
    const society = await requireSocietyBySlug(this.authorization, slug);
    const societyId = society.id;
    await requireActiveMember(this.authorization, principal, societyId);
    const now = this.clock.now();
    const input: CreateThreadInput = {
      id: randomUUID(),
      societyId,
      authorId: principal.userId,
      title: normalizeThreadTitle(command.title),
      body: normalizeThreadBody(command.body),
      createdAt: now,
      updatedAt: now,
    };
    const mediaIds = normalizeMediaIds(command.mediaIds);
    await this.media.assertReadyThreadAttachments(principal.userId, mediaIds);

    const thread = await this.transactions.withTransaction(async (repository) => {
      const created = await repository.createThread(input);
      await repository.replaceThreadMedia(created.id, mediaIds);
      return created;
    });

    await this.events.publishThreadCreated(thread);
    this.onThreadCreated?.(thread.id);

    const vote = principal === undefined
      ? null
      : await this.repository.findThreadVote(thread.id, principal.userId);
    return toThreadDto(
      thread,
      await this.repository.listThreadMedia(thread.id),
      await this.profile.findPublicIdentity(thread.authorId),
      vote?.value ?? 0,
    );
  }

  async getThread(
    principal: RequestPrincipal | undefined,
    threadId: string,
  ): Promise<ThreadDto> {
    const thread = await this.threadOrThrow(threadId);
    if (
      thread.status !== "published" &&
      !(await canReadRetained(this.authorization, principal, thread.societyId, thread.authorId))
    ) {
      throw new ApplicationError("NOT_FOUND", "Thread was not found");
    }

    const vote = principal === undefined
      ? null
      : await this.repository.findThreadVote(thread.id, principal.userId);
    const decision = await this.latestDecision(thread.id);
    return toThreadDto(
      thread,
      await this.repository.listThreadMedia(thread.id),
      undefined,
      vote?.value ?? 0,
      decision,
    );
  }

  async updateThread(
    principal: RequestPrincipal,
    threadId: string,
    command: UpdateThreadCommand,
  ): Promise<ThreadDto> {
    const current = await this.threadOrThrow(threadId);
    await assertMutationAuthority(
      this.authorization,
      principal,
      current.societyId,
      current.authorId,
    );
    if (current.status === "deleted") {
      throw new ApplicationError("NOT_FOUND", "Thread was not found");
    }

    const now = this.clock.now();
    const input: UpdateThreadInput = {
      updatedAt: now,
      ...(command.title === undefined ? {} : { title: normalizeThreadTitle(command.title) }),
      ...(command.body === undefined ? {} : { body: normalizeThreadBody(command.body) }),
    };
    const mediaIds = command.mediaIds === undefined ? undefined : normalizeMediaIds(command.mediaIds);
    if (mediaIds !== undefined) {
      await this.media.assertReadyThreadAttachments(current.authorId, mediaIds);
    }

    const updated = await this.transactions.withTransaction(async (repository) => {
      const locked = await repository.findThreadForUpdate(threadId);
      if (locked === null || locked.status === "deleted") {
        throw new ApplicationError("NOT_FOUND", "Thread was not found");
      }
      const result = await repository.updateThread(threadId, input);
      if (result === null) {
        throw new ApplicationError("NOT_FOUND", "Thread was not found");
      }
      if (mediaIds !== undefined) {
        await repository.replaceThreadMedia(threadId, mediaIds);
      }
      return result;
    });

    return toThreadDto(updated, await this.repository.listThreadMedia(threadId));
  }

  async deleteThread(principal: RequestPrincipal, threadId: string): Promise<ThreadDto> {
    const current = await this.threadOrThrow(threadId);
    await assertMutationAuthority(
      this.authorization,
      principal,
      current.societyId,
      current.authorId,
    );
    if (current.status === "deleted") {
      return toThreadDto(current, await this.repository.listThreadMedia(threadId));
    }

    const now = this.clock.now();
    const deleted = await this.transactions.withTransaction(async (repository) => {
      const locked = await repository.findThreadForUpdate(threadId);
      if (locked === null) {
        throw new ApplicationError("NOT_FOUND", "Thread was not found");
      }
      const result = await repository.softDeleteThread(threadId, now, now);
      if (result === null) {
        throw new ApplicationError("NOT_FOUND", "Thread was not found");
      }
      return result;
    });

    return toThreadDto(deleted, await this.repository.listThreadMedia(threadId));
  }

  /**
   * Return the full persisted content-analysis outcome for a thread.
   * Accessible only to system admins or the thread's society moderators.
   * Returns null when no successful analysis run exists yet.
   */
  async getThreadAnalysis(
    principal: RequestPrincipal,
    threadId: string,
  ): Promise<ThreadAnalysisDetails | null> {
    const thread = await this.threadOrThrow(threadId);
    await requireSociety(this.authorization, thread.societyId);

    if (
      !(await hasSocietyModeratorAuthority(
        this.authorization,
        principal,
        thread.societyId,
      ))
    ) {
      throw new ApplicationError(
        "SOCIETY_FORBIDDEN",
        "Only a society moderator or system admin can view analysis details",
      );
    }
    if (this.threadAnalysisReader === undefined) return null;
    return this.threadAnalysisReader.findLatestSucceededAnalysis(threadId);
  }

  /**
   * Moderator/system-admin override of a thread's automated content-analysis
   * outcome. `accept` publishes the thread and records an accepting override;
   * `reject` hides it (status `removed`) and records a rejecting override;
   * `reanalyze` re-runs analysis without changing visibility. When
   * `societySlug` is provided the actor must be a moderator of that society
   * and the thread must belong to it; otherwise the actor must be a system
   * admin.
   */
  async moderateAnalysis(
    principal: RequestPrincipal,
    threadId: string,
    action: AnalysisModerationAction,
    societySlug?: string,
  ): Promise<ThreadDto> {
    const thread = await this.threadOrThrow(threadId);
    if (thread.status === "deleted") {
      throw new ApplicationError("NOT_FOUND", "Thread was not found");
    }
    await this.assertAnalysisModerationAuthority(
      principal,
      thread.societyId,
      societySlug,
    );

    if (action.kind === "reanalyze") {
      if (this.analysisModeration === undefined) {
        throw new ApplicationError(
          "ANALYSIS_UNAVAILABLE",
          "Automated content analysis is not configured",
        );
      }
      await this.analysisModeration.reanalyze(threadId);
      return toThreadDto(
        await this.threadOrThrow(threadId),
        await this.repository.listThreadMedia(threadId),
      );
    }

    const decision = action.kind;
    await this.analysisModeration?.override(
      threadId,
      decision,
      principal.userId,
      action.reason ?? null,
    );
    const updated = await this.repository.setThreadStatus(
      threadId,
      decision === "accept" ? "published" : "removed",
      this.clock.now(),
    );
    if (updated === null) {
      throw new ApplicationError("NOT_FOUND", "Thread was not found");
    }
    return toThreadDto(
      updated,
      await this.repository.listThreadMedia(threadId),
    );
  }

  private async assertAnalysisModerationAuthority(
    principal: RequestPrincipal,
    societyId: string,
    societySlug: string | undefined,
  ): Promise<void> {
    if (societySlug !== undefined) {
      const society = await requireSocietyBySlug(this.authorization, societySlug);
      if (society.id !== societyId) {
        throw new ApplicationError("NOT_FOUND", "Thread was not found");
      }
      if (
        !(await hasSocietyModeratorAuthority(
          this.authorization,
          principal,
          societyId,
        ))
      ) {
        throw new ApplicationError(
          "SOCIETY_FORBIDDEN",
          "Society moderator access is required",
        );
      }
      return;
    }
    if (principal.platformRole !== "system_admin") {
      throw new ApplicationError(
        "ADMIN_REQUIRED",
        "System-admin access is required",
      );
    }
  }

  private async threadOrThrow(threadId: string) {
    const thread = await this.repository.findThread(threadId);
    if (thread === null) {
      throw new ApplicationError("NOT_FOUND", "Thread was not found");
    }
    return thread;
  }

  private async latestDecision(threadId: string): Promise<"allow" | "review" | null> {
    if (this.analysisDecisionReader === undefined) return null;
    const decisions = await this.analysisDecisionReader.findLatestDecisionsByThreads([threadId]);
    return decisions.get(threadId) ?? null;
  }
}

function normalizeMediaIds(mediaIds: readonly string[] | undefined): readonly string[] {
  if (mediaIds === undefined) return [];
  if (mediaIds.length > 20 || new Set(mediaIds).size !== mediaIds.length) {
    throw new ApplicationError("VALIDATION_ERROR", "A thread can contain at most 20 unique media references");
  }

  return [...mediaIds];
}

export function normalizeThreadPageLimit(limit: number | undefined): number {
  return normalizePageSize(limit);
}
