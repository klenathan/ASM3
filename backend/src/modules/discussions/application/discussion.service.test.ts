import { describe, expect, it } from "vitest";

import type { Clock } from "../../../shared/application/clock";
import type { PageRequest, PageResult } from "../../../shared/application/pagination";
import type { TransactionManager } from "../../../shared/application/transaction";
import type { RequestPrincipal } from "../../../shared/presentation/request-principal";
import type { MembershipRepository } from "../../societies/application/membership.repository";
import type { SocietyRepository, MembershipSocietyRecord } from "../../societies/application/society.repository";
import type { MembershipRecord } from "../../societies/domain/membership";
import type { SocietyRecord } from "../../societies/domain/society";
import { CommentService } from "./comment.service";
import type {
  CreateCommentInput,
  CreateThreadInput,
  DiscussionRepository,
  ThreadMediaRecord,
  UpdateCommentInput,
  UpdateThreadInput,
} from "./discussion.repository";
import type {
  CommentRecord,
  CommentVoteRecord,
  ThreadRecord,
  ThreadVoteRecord,
} from "../domain/discussion";
import { ThreadService } from "./thread.service";
import type { ThreadAnalysisDetailsReader } from "./analysis-details.reader";
import type { ThreadAnalysisDetails } from "../../content-analysis";
import { VoteService } from "./vote.service";
import type { DiscussionProfilePort } from "./discussion.profile";
import type { ThreadMediaPort } from "./thread-media.port";
import type { ThreadEventPublisher } from "./thread-events.port";
import type { PlacesPort } from "../../places/application/places.port";

const society: SocietyRecord = {
  id: "society-id",
  slug: "cloud",
  name: "Cloud Computing",
  description: "Cloud Computing students",
  avatarMediaId: "00000000-0000-4000-8000-00000000000a",
  status: "active",
  createdBy: "admin-id",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

const now = new Date("2026-01-02T00:00:00.000Z");
const clock: Clock = { now: () => now };
const member: RequestPrincipal = { userId: "member-id", platformRole: "student" };
const moderator: RequestPrincipal = { userId: "moderator-id", platformRole: "student" };
const outsider: RequestPrincipal = { userId: "outsider-id", platformRole: "student" };
const inactive: RequestPrincipal = { userId: "inactive-id", platformRole: "student" };

describe("discussion services", () => {
  it("requires active membership to create threads", async () => {
    const repository = new FakeDiscussionRepository();
    const service = createThreadService(repository);

    await expect(
      service.createThread(inactive, society.id, { title: "No access", body: "Body" }),
    ).rejects.toMatchObject({ code: "SOCIETY_FORBIDDEN" });

    await expect(
      service.createThread(member, society.id, { title: "A thread", body: "Body" }),
    ).resolves.toMatchObject({ authorId: member.userId, status: "published" });
  });

  it("validates media ownership and readiness before creating a thread", async () => {
    const repository = new FakeDiscussionRepository();
    const media: ThreadMediaPort = {
      assertReadyThreadAttachments: async (ownerId, mediaIds) => {
        expect(ownerId).toBe(member.userId);
        expect(mediaIds).toEqual(["media-id"]);
        throw new Error("media is not ready");
      },
    };

    await expect(
      createThreadService(repository, media).createThread(member, society.id, {
        title: "Thread with image",
        body: "Body",
        mediaIds: ["media-id"],
      }),
    ).rejects.toThrow("media is not ready");
    expect(repository.threads.size).toBe(0);
  });

  it("emits a thread.created event exactly once after a successful creation", async () => {
    const repository = new FakeDiscussionRepository();
    const publishedThreads: { id: string; title: string }[] = [];
    const publisher: ThreadEventPublisher = {
      publishThreadCreated: async (thread) => {
        publishedThreads.push(thread);
      },
      publishAutoRemoved: async () => undefined,
    };
    const service = createThreadService(repository, undefined, publisher);

    await service.createThread(member, society.id, { title: "Event", body: "Body" });

    expect(publishedThreads).toHaveLength(1);
    expect(publishedThreads[0]!.title).toBe("Event");
    expect(repository.threads.size).toBe(1);
  });

  it("does not emit a thread.created event when creation is rejected", async () => {
    const repository = new FakeDiscussionRepository();
    let published = 0;
    const service = createThreadService(repository, undefined, {
      publishThreadCreated: async () => {
        published += 1;
      },
      publishAutoRemoved: async () => undefined,
    });

    await expect(
      service.createThread(inactive, society.id, { title: "No access", body: "Body" }),
    ).rejects.toMatchObject({ code: "SOCIETY_FORBIDDEN" });

    expect(published).toBe(0);
    expect(repository.threads.size).toBe(0);
  });

  it("validates same-thread parents, caps depth, and updates comment count", async () => {
    const repository = new FakeDiscussionRepository();
    const threadService = createThreadService(repository);
    const commentService = createCommentService(repository);
    const thread = await threadService.createThread(member, society.id, {
      title: "Thread",
      body: "Body",
    });
    const otherThread = await threadService.createThread(member, society.id, {
      title: "Other",
      body: "Body",
    });

    const root = await commentService.createComment(member, thread.id, { body: "Root" });
    const child = await commentService.createComment(member, thread.id, {
      body: "Child",
      parentId: root.id,
    });
    const grandchild = await commentService.createComment(member, thread.id, {
      body: "Grandchild",
      parentId: child.id,
    });

    await expect(
      commentService.createComment(member, thread.id, {
        body: "Too deep",
        parentId: grandchild.id,
      }),
    ).rejects.toMatchObject({ code: "COMMENT_DEPTH_EXCEEDED" });
    await expect(
      commentService.createComment(member, otherThread.id, {
        body: "Wrong thread",
        parentId: root.id,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    expect(repository.threads.get(thread.id)?.commentCount).toBe(3);
    await commentService.deleteComment(member, root.id);
    expect(repository.threads.get(thread.id)?.commentCount).toBe(2);
    expect(repository.comments.get(root.id)?.body).toBeNull();
  });

  it("allows retained reads only to the owner or society moderator", async () => {
    const repository = new FakeDiscussionRepository();
    const service = createThreadService(repository);
    const thread = await service.createThread(member, society.id, {
      title: "Retained",
      body: "Body",
    });
    await service.deleteThread(member, thread.id);

    await expect(service.getThread(outsider, thread.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(service.getThread(member, thread.id)).resolves.toMatchObject({
      status: "deleted",
      body: null,
    });
    await expect(service.getThread(moderator, thread.id)).resolves.toMatchObject({ status: "deleted" });
  });

  it("includes the requesting user's vote in a thread detail", async () => {
    const repository = new FakeDiscussionRepository();
    const threadService = createThreadService(repository);
    const voteService = createVoteService(repository);
    const thread = await threadService.createThread(member, society.id, {
      title: "Vote detail",
      body: "Body",
    });

    await voteService.voteThread(member, thread.id, -1);

    await expect(threadService.getThread(member, thread.id)).resolves.toMatchObject({
      myVote: -1,
    });
    await expect(threadService.getThread(undefined, thread.id)).resolves.toMatchObject({
      myVote: 0,
    });
  });

  it("sets votes idempotently and applies only score deltas", async () => {
    const repository = new FakeDiscussionRepository();
    const threadService = createThreadService(repository);
    const voteService = createVoteService(repository);
    const thread = await threadService.createThread(member, society.id, {
      title: "Vote",
      body: "Body",
    });

    await expect(voteService.voteThread(member, thread.id, 1)).resolves.toMatchObject({ score: 1, value: 1 });
    await expect(voteService.voteThread(member, thread.id, 1)).resolves.toMatchObject({ score: 1, value: 1 });
    await expect(voteService.voteThread(member, thread.id, -1)).resolves.toMatchObject({ score: -1, value: -1 });
    await expect(voteService.voteThread(member, thread.id, 0)).resolves.toMatchObject({ score: 0, value: 0 });
    await expect(voteService.voteThread(inactive, thread.id, 1)).rejects.toMatchObject({
      code: "SOCIETY_FORBIDDEN",
    });
  });

  it("attaches verified location snapshot with canonical details", async () => {
    const repository = new FakeDiscussionRepository();
    const fakePlaces: PlacesPort = {
      search: async () => [],
      retrieve: async (id) => ({
        mapboxId: id,
        name: "RMIT Building 80",
        placeType: "poi",
        latitude: -37.808,
        longitude: 144.963,
        address: { street: "445 Swanston St" },
        meta: { category: "education" },
      }),
      reverse: async (lat, lng) => ({ latitude: lat, longitude: lng, address: null, name: null }),
    };
    const service = createThreadService(repository, undefined, undefined, fakePlaces);

    const thread = await service.createThread(member, society.id, {
      title: "Study session at Building 80",
      body: "Level 4",
      location: { mapboxId: "place.80" },
    });

    expect(thread.location).toEqual({
      mapboxId: "place.80",
      name: "RMIT Building 80",
      placeType: "poi",
      latitude: -37.808,
      longitude: 144.963,
      address: { street: "445 Swanston St" },
      meta: { category: "education" },
    });
  });

  it("accepts fine-tuned coordinates within 0.001 degree threshold", async () => {
    const repository = new FakeDiscussionRepository();
    const fakePlaces: PlacesPort = {
      search: async () => [],
      retrieve: async (id) => ({
        mapboxId: id,
        name: "RMIT Building 80",
        placeType: "poi",
        latitude: -37.808,
        longitude: 144.963,
        address: { street: "445 Swanston St" },
        meta: null,
      }),
      reverse: async (lat, lng) => ({ latitude: lat, longitude: lng, address: null, name: null }),
    };
    const service = createThreadService(repository, undefined, undefined, fakePlaces);

    const thread = await service.createThread(member, society.id, {
      title: "Building 80 Entrance",
      body: "Swanston St side",
      location: {
        mapboxId: "place.80",
        latitude: -37.8085,
        longitude: 144.9635,
      },
    });

    expect(thread.location?.latitude).toBe(-37.8085);
    expect(thread.location?.longitude).toBe(144.9635);
    expect(thread.location?.name).toBe("RMIT Building 80");
  });

  it("falls back to canonical coordinates when fine-tuning exceeds threshold", async () => {
    const repository = new FakeDiscussionRepository();
    const fakePlaces: PlacesPort = {
      search: async () => [],
      retrieve: async (id) => ({
        mapboxId: id,
        name: "RMIT Building 80",
        placeType: "poi",
        latitude: -37.808,
        longitude: 144.963,
        address: null,
        meta: null,
      }),
      reverse: async (lat, lng) => ({ latitude: lat, longitude: lng, address: null, name: null }),
    };
    const service = createThreadService(repository, undefined, undefined, fakePlaces);

    const thread = await service.createThread(member, society.id, {
      title: "Building 80 Remote Pin",
      body: "Pin too far away",
      location: {
        mapboxId: "place.80",
        latitude: -37.810,
        longitude: 144.963,
      },
    });

    expect(thread.location?.latitude).toBe(-37.808);
    expect(thread.location?.longitude).toBe(144.963);
  });

  it("falls back to canonical coordinates when client coordinates are invalid or out of range", async () => {
    const repository = new FakeDiscussionRepository();
    const fakePlaces: PlacesPort = {
      search: async () => [],
      retrieve: async (id) => ({
        mapboxId: id,
        name: "RMIT Building 80",
        placeType: "poi",
        latitude: -37.808,
        longitude: 144.963,
        address: null,
        meta: null,
      }),
      reverse: async (lat, lng) => ({ latitude: lat, longitude: lng, address: null, name: null }),
    };
    const service = createThreadService(repository, undefined, undefined, fakePlaces);

    const thread = await service.createThread(member, society.id, {
      title: "Invalid Coords",
      body: "Testing",
      location: {
        mapboxId: "place.80",
        latitude: 95,
        longitude: 144.963,
      },
    });

    expect(thread.location?.latitude).toBe(-37.808);
    expect(thread.location?.longitude).toBe(144.963);
  });

  it("rejects location attachment when mapboxId is missing or blank", async () => {
    const repository = new FakeDiscussionRepository();
    const service = createThreadService(repository);

    await expect(
      service.createThread(member, society.id, {
        title: "Missing mapboxId",
        body: "Testing",
        location: { mapboxId: "   " },
      }),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      message: "Location mapboxId is required",
    });
  });

  it("throws PLACES_UNAVAILABLE when placesPort fails or is unconfigured", async () => {
    const repository = new FakeDiscussionRepository();
    const serviceNoPort = createThreadService(repository);
    await expect(
      serviceNoPort.createThread(member, society.id, {
        title: "No Places Port",
        body: "Testing",
        location: { mapboxId: "place.1" },
      }),
    ).rejects.toMatchObject({
      code: "PLACES_UNAVAILABLE",
    });

    const failingPort: PlacesPort = {
      search: async () => [],
      retrieve: async () => {
        throw new Error("Mapbox API network error");
      },
      reverse: async (lat, lng) => ({ latitude: lat, longitude: lng, address: null, name: null }),
    };
    const serviceFailing = createThreadService(repository, undefined, undefined, failingPort);
    await expect(
      serviceFailing.createThread(member, society.id, {
        title: "Failing Places Port",
        body: "Testing",
        location: { mapboxId: "place.1" },
      }),
    ).rejects.toMatchObject({
      code: "PLACES_UNAVAILABLE",
    });
  });

  it("updates and clears thread location", async () => {
    const repository = new FakeDiscussionRepository();
    const fakePlaces: PlacesPort = {
      search: async () => [],
      retrieve: async (id) => ({
        mapboxId: id,
        name: "RMIT Building 10",
        placeType: "poi",
        latitude: -37.807,
        longitude: 144.964,
        address: null,
        meta: null,
       }),
      reverse: async (lat, lng) => ({ latitude: lat, longitude: lng, address: null, name: null }),
    };
    const service = createThreadService(repository, undefined, undefined, fakePlaces);

    const created = await service.createThread(member, society.id, {
      title: "Initial thread",
      body: "Body",
      location: { mapboxId: "place.10" },
    });
    expect(created.location?.name).toBe("RMIT Building 10");

    const updated = await service.updateThread(member, created.id, {
      location: {
        mapboxId: "place.10",
        latitude: -37.8074,
        longitude: 144.9642,
      },
    });
    expect(updated.location?.latitude).toBe(-37.8074);
    expect(updated.location?.longitude).toBe(144.9642);

    const cleared = await service.updateThread(member, created.id, {
      location: null,
    });
    expect(cleared.location).toBeNull();
  });
});

function createThreadService(
  repository: FakeDiscussionRepository,
  media: ThreadMediaPort = readyMedia,
  events: ThreadEventPublisher = {
    publishThreadCreated: async () => undefined,
    publishAutoRemoved: async () => undefined,
  },
  placesPort?: PlacesPort,
): ThreadService {
  return new ThreadService({
    repository,
    transactions: immediateTransaction(repository),
    clock,
    profile: fakeProfile,
    media,
    events,
    membershipRepository: new FakeMembershipRepository(),
    societyRepository: new FakeSocietyRepository(),
    ...(placesPort !== undefined ? { placesPort } : {}),
  });
}

const readyMedia: ThreadMediaPort = {
  assertReadyThreadAttachments: async () => undefined,
};

const fakeProfile: DiscussionProfilePort = {
  findPublicIdentity: async () => null,
  findPublicIdentities: async () => new Map(),
  canReadActivityBy: async () => true,
};

function createCommentService(repository: FakeDiscussionRepository): CommentService {
  return new CommentService({
    repository,
    transactions: immediateTransaction(repository),
    clock,
    membershipRepository: new FakeMembershipRepository(),
    societyRepository: new FakeSocietyRepository(),
  });
}

function createVoteService(repository: FakeDiscussionRepository): VoteService {
  return new VoteService({
    repository,
    transactions: immediateTransaction(repository),
    clock,
    membershipRepository: new FakeMembershipRepository(),
    societyRepository: new FakeSocietyRepository(),
  });
}

class FakeDiscussionRepository implements DiscussionRepository {
  readonly threads = new Map<string, ThreadRecord>();
  readonly comments = new Map<string, CommentRecord>();
  private readonly threadMedia = new Map<string, ThreadMediaRecord[]>();
  private readonly threadVotes = new Map<string, ThreadVoteRecord>();
  private readonly commentVotes = new Map<string, CommentVoteRecord>();

  async listThreads(
    societyId: string,
    _page: PageRequest,
    includeRetained: boolean,
  ): Promise<PageResult<ThreadRecord>> {
    const items = [...this.threads.values()].filter(
      (thread) => thread.societyId === societyId && (includeRetained || thread.status === "published"),
    );
    return { items, nextCursor: null, hasMore: false };
  }

  async listThreadsInSocieties(
    societyIds: readonly string[],
    _page: PageRequest,
  ): Promise<PageResult<ThreadRecord>> {
    const ids = new Set(societyIds);
    const items = [...this.threads.values()].filter(
      (thread) => ids.has(thread.societyId) && thread.status === "published",
    );
    return { items, nextCursor: null, hasMore: false };
  }

  async listThreadsByAuthor(
    authorId: string,
    _page: PageRequest,
  ): Promise<PageResult<ThreadRecord>> {
    const items = [...this.threads.values()].filter(
      (thread) => thread.authorId === authorId && thread.status === "published",
    );
    return { items, nextCursor: null, hasMore: false };
  }

  async listAllThreads(_page: PageRequest): Promise<PageResult<ThreadRecord>> {
    const items = [...this.threads.values()].filter(
      (thread) => thread.status === "published",
    );
    return { items, nextCursor: null, hasMore: false };
  }

  async findThread(threadId: string): Promise<ThreadRecord | null> {
    return this.threads.get(threadId) ?? null;
  }

  async listPublishedThreadIdsBefore(olderThan: Date, limit = 50): Promise<string[]> {
    return [...this.threads.values()]
      .filter((t) => t.status === "published" && t.createdAt < olderThan)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .slice(0, limit)
      .map((t) => t.id);
  }

  async findThreadsByIds(ids: readonly string[]): Promise<readonly ThreadRecord[]> {
    const idSet = new Set(ids);
    return [...this.threads.values()].filter((thread) => idSet.has(thread.id));
  }

  async listThreadMediaBatch(_threadIds: readonly string[]): Promise<readonly ThreadMediaRecord[]> {
    return [...this.threadMedia.values()].flat();
  }

  async findThreadVotes(
    _threadIds: readonly string[],
    _userId: string,
  ): Promise<readonly ThreadVoteRecord[]> {
    return [...this.threadVotes.values()];
  }

  async findThreadForUpdate(threadId: string): Promise<ThreadRecord | null> {
    return this.findThread(threadId);
  }

  async createThread(input: CreateThreadInput): Promise<ThreadRecord> {
    const thread: ThreadRecord = {
      ...input,
      body: input.body,
      status: "published",
      score: 0,
      commentCount: 0,
      deletedAt: null,
      location: input.location ?? null,
    };
    this.threads.set(thread.id, thread);
    return thread;
  }

  async updateThread(threadId: string, input: UpdateThreadInput): Promise<ThreadRecord | null> {
    const current = await this.findThread(threadId);
    if (current === null) return null;
    const location = input.clearLocation ? null : (input.location !== undefined ? input.location : current.location);
    const updated = { ...current, ...input, location };
    this.threads.set(threadId, updated);
    return updated;
  }

  async softDeleteThread(threadId: string, deletedAt: Date, updatedAt: Date): Promise<ThreadRecord | null> {
    const current = await this.findThread(threadId);
    if (current === null) return null;
    const deleted: ThreadRecord = { ...current, status: "deleted", body: null, deletedAt, updatedAt };
    this.threads.set(threadId, deleted);
    return deleted;
  }

  async setThreadStatus(threadId: string, status: "published" | "removed", updatedAt: Date): Promise<ThreadRecord | null> {
    const current = await this.findThread(threadId);
    if (current === null) return null;
    const updated: ThreadRecord = { ...current, status, updatedAt };
    this.threads.set(threadId, updated);
    return updated;
  }

  async removePublishedThreadIfActive(threadId: string, updatedAt: Date): Promise<ThreadRecord | null> {
    const current = await this.findThread(threadId);
    if (current === null || current.status !== "published") return null;
    const updated: ThreadRecord = { ...current, status: "removed", updatedAt };
    this.threads.set(threadId, updated);
    return updated;
  }

  async listThreadMedia(threadId: string): Promise<readonly ThreadMediaRecord[]> {
    return this.threadMedia.get(threadId) ?? [];
  }

  async replaceThreadMedia(threadId: string, mediaIds: readonly string[]): Promise<readonly ThreadMediaRecord[]> {
    const media = mediaIds.map((mediaId, position) => ({ threadId, mediaId, position }));
    this.threadMedia.set(threadId, media);
    return media;
  }

  async listComments(
    threadId: string,
    _page: PageRequest,
    includeRetained: boolean,
  ): Promise<PageResult<CommentRecord>> {
    const items = [...this.comments.values()].filter(
      (comment) => comment.threadId === threadId && (includeRetained || comment.status === "published"),
    );
    return { items, nextCursor: null, hasMore: false };
  }

  async listCommentsByAuthor(
    authorId: string,
    _page: PageRequest,
  ): Promise<PageResult<CommentRecord>> {
    const items = [...this.comments.values()].filter(
      (comment) => comment.authorId === authorId && comment.status === "published",
    );
    return { items, nextCursor: null, hasMore: false };
  }

  async findComment(commentId: string): Promise<CommentRecord | null> {
    return this.comments.get(commentId) ?? null;
  }

  async findCommentForUpdate(commentId: string): Promise<CommentRecord | null> {
    return this.findComment(commentId);
  }

  async createComment(input: CreateCommentInput): Promise<CommentRecord> {
    const comment: CommentRecord = {
      ...input,
      body: input.body,
      status: "published",
      score: 0,
      deletedAt: null,
    };
    this.comments.set(comment.id, comment);
    return comment;
  }

  async updateComment(commentId: string, input: UpdateCommentInput): Promise<CommentRecord | null> {
    const current = await this.findComment(commentId);
    if (current === null) return null;
    const updated = { ...current, ...input };
    this.comments.set(commentId, updated);
    return updated;
  }

  async softDeleteComment(commentId: string, deletedAt: Date, updatedAt: Date): Promise<CommentRecord | null> {
    const current = await this.findComment(commentId);
    if (current === null) return null;
    const deleted: CommentRecord = { ...current, status: "deleted", body: null, deletedAt, updatedAt };
    this.comments.set(commentId, deleted);
    return deleted;
  }

  async incrementCommentCount(threadId: string, delta: number): Promise<ThreadRecord | null> {
    const current = await this.findThread(threadId);
    if (current === null) return null;
    const updated = { ...current, commentCount: current.commentCount + delta };
    this.threads.set(threadId, updated);
    return updated;
  }

  async findThreadVote(threadId: string, userId: string): Promise<ThreadVoteRecord | null> {
    return this.threadVotes.get(`${threadId}:${userId}`) ?? null;
  }

  async createThreadVote(input: {
    readonly threadId: string;
    readonly userId: string;
    readonly value: -1 | 1;
    readonly createdAt: Date;
    readonly updatedAt: Date;
  }): Promise<ThreadVoteRecord> {
    const vote = { ...input };
    this.threadVotes.set(`${input.threadId}:${input.userId}`, vote);
    return vote;
  }

  async updateThreadVote(threadId: string, userId: string, value: -1 | 1, updatedAt: Date): Promise<ThreadVoteRecord | null> {
    const current = await this.findThreadVote(threadId, userId);
    if (current === null) return null;
    const updated = { ...current, value, updatedAt };
    this.threadVotes.set(`${threadId}:${userId}`, updated);
    return updated;
  }

  async deleteThreadVote(threadId: string, userId: string): Promise<boolean> {
    return this.threadVotes.delete(`${threadId}:${userId}`);
  }

  async incrementThreadScore(threadId: string, delta: number): Promise<ThreadRecord | null> {
    const current = await this.findThread(threadId);
    if (current === null) return null;
    const updated = { ...current, score: current.score + delta };
    this.threads.set(threadId, updated);
    return updated;
  }

  async findCommentVote(commentId: string, userId: string): Promise<CommentVoteRecord | null> {
    return this.commentVotes.get(`${commentId}:${userId}`) ?? null;
  }

  async findCommentVotes(
    commentIds: readonly string[],
    userId: string,
  ): Promise<readonly CommentVoteRecord[]> {
    return commentIds.flatMap((commentId) => {
      const vote = this.commentVotes.get(`${commentId}:${userId}`);
      return vote === undefined ? [] : [vote];
    });
  }

  async createCommentVote(input: {
    readonly commentId: string;
    readonly userId: string;
    readonly value: -1 | 1;
    readonly createdAt: Date;
    readonly updatedAt: Date;
  }): Promise<CommentVoteRecord> {
    const vote = { ...input };
    this.commentVotes.set(`${input.commentId}:${input.userId}`, vote);
    return vote;
  }

  async updateCommentVote(commentId: string, userId: string, value: -1 | 1, updatedAt: Date): Promise<CommentVoteRecord | null> {
    const current = await this.findCommentVote(commentId, userId);
    if (current === null) return null;
    const updated = { ...current, value, updatedAt };
    this.commentVotes.set(`${commentId}:${userId}`, updated);
    return updated;
  }

  async deleteCommentVote(commentId: string, userId: string): Promise<boolean> {
    return this.commentVotes.delete(`${commentId}:${userId}`);
  }

  async incrementCommentScore(commentId: string, delta: number): Promise<CommentRecord | null> {
    const current = await this.findComment(commentId);
    if (current === null) return null;
    const updated = { ...current, score: current.score + delta };
    this.comments.set(commentId, updated);
    return updated;
  }
}

class FakeMembershipRepository implements MembershipRepository {
  async findMembership(societyId: string, userId: string): Promise<MembershipRecord | null> {
    if (societyId !== society.id) return null;
    if (userId === member.userId || userId === moderator.userId) {
      return {
        societyId,
        userId,
        role: userId === moderator.userId ? "moderator" : "member",
        status: "active",
        joinedAt: now,
        updatedAt: now,
        bannedBy: null,
        bannedAt: null,
      };
    }
    return null;
  }

  async countActiveModerators(_societyId: string): Promise<number> { return 1; }
  async findActiveMembershipsByUser(_userId: string): Promise<readonly MembershipRecord[]> { return []; }
  async createMembership(input: never): Promise<MembershipRecord> { return input; }
  async updateMembership(): Promise<MembershipRecord | null> { return null; }
}

class FakeSocietyRepository implements SocietyRepository {
  async findSocietyById(societyId: string): Promise<SocietyRecord | null> {
    return societyId === society.id ? society : null;
  }

  async listSocieties(_page: PageRequest): Promise<PageResult<SocietyRecord>> {
    return { items: [society], nextCursor: null, hasMore: false };
  }
  async listActiveMemberSocieties(_userId: string): Promise<readonly MembershipSocietyRecord[]> { return []; }
  async findSocietyBySlug(_slug: string): Promise<SocietyRecord | null> { return society; }
  async findSocietiesByIds(ids: readonly string[]): Promise<readonly SocietyRecord[]> {
    return ids.includes(society.id) ? [society] : [];
  }
  async createSociety(input: never): Promise<SocietyRecord> { return input; }
  async listRules(): Promise<readonly never[]> { return []; }
  async findRuleById(): Promise<null> { return null; }
  async createRule(input: never): Promise<never> { return input; }
  async updateRule(): Promise<null> { return null; }
  async deleteRule(): Promise<boolean> { return false; }
}

describe("ThreadService.getThreadAnalysis", () => {
  const details: ThreadAnalysisDetails = {
    runId: "run-1",
    status: "succeeded",
    decision: "review",
    override: null,
    sentiment: null,
    findings: null,
    summary: "Flagged for review",
    rationale: "The title may violate community policy.",
    modelId: "deepseek/test",
    promptVersion: "2",
    completedAt: now.toISOString(),
  };

  function withReader(repository: FakeDiscussionRepository, reader: ThreadAnalysisDetailsReader): ThreadService {
    return new ThreadService({
      repository,
      transactions: immediateTransaction(repository),
      clock,
      profile: fakeProfile,
      media: readyMedia,
      events: {
        publishThreadCreated: async () => undefined,
        publishAutoRemoved: async () => undefined,
      },
      membershipRepository: new FakeMembershipRepository(),
      societyRepository: new FakeSocietyRepository(),
      threadAnalysisReader: reader,
    });
  }

  it("returns full analysis for a society moderator", async () => {
    const repository = new FakeDiscussionRepository();
    const service = createThreadService(repository);
    const thread = await service.createThread(moderator, society.id, {
      title: "Moderated",
      body: "Body",
    });
    const reader: ThreadAnalysisDetailsReader = {
      findLatestSucceededAnalysis: async (id) => (id === thread.id ? details : null),
    };

    await expect(withReader(repository, reader).getThreadAnalysis(moderator, thread.id))
      .resolves.toEqual(details);
  });

  it("allows any system admin across societies", async () => {
    const systemAdmin: RequestPrincipal = { userId: "admin-id", platformRole: "system_admin" };
    const repository = new FakeDiscussionRepository();
    const service = createThreadService(repository);
    const thread = await service.createThread(moderator, society.id, {
      title: "Any society",
      body: "Body",
    });
    const reader: ThreadAnalysisDetailsReader = {
      findLatestSucceededAnalysis: async () => null,
    };

    await expect(withReader(repository, reader).getThreadAnalysis(systemAdmin, thread.id))
      .resolves.toBeNull();
  });

  it("allows a plain member to read the analysis (read-only)", async () => {
    const repository = new FakeDiscussionRepository();
    const service = createThreadService(repository);
    const thread = await service.createThread(member, society.id, {
      title: "Public analysis",
      body: "Body",
    });
    const reader: ThreadAnalysisDetailsReader = {
      findLatestSucceededAnalysis: async () => details,
    };

    await expect(withReader(repository, reader).getThreadAnalysis(member, thread.id))
      .resolves.toEqual(details);
  });

  it("rejects a thread that does not exist", async () => {
    const repository = new FakeDiscussionRepository();
    const reader: ThreadAnalysisDetailsReader = {
      findLatestSucceededAnalysis: async () => details,
    };

    await expect(withReader(repository, reader).getThreadAnalysis(moderator, "missing-id"))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});


describe("ThreadService.moderateAnalysis", () => {
  interface ModerationCalls {
    overrides: Array<{ threadId: string; decision: "accept" | "reject"; actorId: string; reason: string | null }>;
    reanalyzed: string[];
  }
  function withModeration(
    repository: FakeDiscussionRepository,
  ): { service: ThreadService; calls: ModerationCalls } {
    const calls: ModerationCalls = { overrides: [], reanalyzed: [] };
    const service = new ThreadService({
      repository,
      transactions: immediateTransaction(repository),
      clock,
      profile: fakeProfile,
      media: readyMedia,
      events: {
        publishThreadCreated: async () => undefined,
        publishAutoRemoved: async () => undefined,
      },
      membershipRepository: new FakeMembershipRepository(),
      societyRepository: new FakeSocietyRepository(),
      analysisModeration: {
        override: async (threadId, decision, actorId, reason) => {
          calls.overrides.push({ threadId, decision, actorId, reason });
        },
        reanalyze: async (threadId) => {
          calls.reanalyzed.push(threadId);
        },
      },
    });
    return { service, calls };
  }

  it("rejects a thread as a society moderator (hides the post)", async () => {
    const repository = new FakeDiscussionRepository();
    const creator = createThreadService(repository);
    const thread = await creator.createThread(moderator, society.slug, {
      title: "Moderated post",
      body: "Body",
    });
    const { service, calls } = withModeration(repository);
    const result = await service.moderateAnalysis(
      moderator,
      thread.id,
      { kind: "reject", reason: "Spam" },
      society.slug,
    );
    expect(result.status).toBe("removed");
    expect(calls.overrides).toEqual([
      { threadId: thread.id, decision: "reject", actorId: moderator.userId, reason: "Spam" },
    ]);
  });

  it("accepts a thread as a system admin", async () => {
    const systemAdmin: RequestPrincipal = { userId: "admin-id", platformRole: "system_admin" };
    const repository = new FakeDiscussionRepository();
    const creator = createThreadService(repository);
    const thread = await creator.createThread(moderator, society.slug, {
      title: "OK post",
      body: "Body",
    });
    const { service, calls } = withModeration(repository);
    const result = await service.moderateAnalysis(
      systemAdmin,
      thread.id,
      { kind: "accept" },
    );
    expect(result.status).toBe("published");
    expect(calls.overrides[0]).toMatchObject({
      threadId: thread.id,
      decision: "accept",
    });
  });

  it("reanalyzes without changing visibility or recording an override", async () => {
    const repository = new FakeDiscussionRepository();
    const creator = createThreadService(repository);
    const thread = await creator.createThread(moderator, society.slug, {
      title: "Reanalyze me",
      body: "Body",
    });
    const { service, calls } = withModeration(repository);
    const result = await service.moderateAnalysis(
      moderator,
      thread.id,
      { kind: "reanalyze" },
      society.slug,
    );
    expect(result.status).toBe("published");
    expect(calls.reanalyzed).toEqual([thread.id]);
    expect(calls.overrides).toHaveLength(0);
  });

  it("denies a plain member from moderating analysis", async () => {
    const repository = new FakeDiscussionRepository();
    const creator = createThreadService(repository);
    const thread = await creator.createThread(moderator, society.slug, {
      title: "Member cannot override",
      body: "Body",
    });
    const { service } = withModeration(repository);
    await expect(
      service.moderateAnalysis(member, thread.id, { kind: "reject" }, society.slug),
    ).rejects.toMatchObject({ code: "SOCIETY_FORBIDDEN" });
  });

  it("fails reanalysis when content analysis is not configured", async () => {
    const repository = new FakeDiscussionRepository();
    const creator = createThreadService(repository);
    const thread = await creator.createThread(moderator, society.slug, {
      title: "No analysis",
      body: "Body",
    });
    const service = createThreadService(repository);
    await expect(
      service.moderateAnalysis(moderator, thread.id, { kind: "reanalyze" }, society.slug),
    ).rejects.toMatchObject({ code: "ANALYSIS_UNAVAILABLE" });
  });
});

function immediateTransaction<T>(repository: T): TransactionManager<T> {
  return { withTransaction: async (work) => work(repository) };
}

