import { describe, expect, it } from "vitest";

import type { PageRequest, PageResult } from "../../../shared/application/pagination";
import type { RequestPrincipal } from "../../../shared/presentation/request-principal";
import type { MembershipRecord } from "../../societies/domain/membership";
import type { SocietyRecord } from "../../societies/domain/society";
import type { MembershipRepository } from "../../societies/application/membership.repository";
import type { SocietyRepository } from "../../societies/application/society.repository";
import type { ThreadRecord } from "../domain/discussion";
import type { DiscussionProfilePort } from "./discussion.profile";
import type {
  DiscussionRepository,
  ThreadMediaRecord,
} from "./discussion.repository";
import type { AnalysisDecision } from "./analysis-decision.reader";
import { FeedService } from "./feed.service";

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

const admin: RequestPrincipal = { userId: "admin-id", platformRole: "system_admin" };
const moderator: RequestPrincipal = { userId: "moderator-id", platformRole: "student" };
const member: RequestPrincipal = { userId: "member-id", platformRole: "student" };

function thread(id: string, title: string): ThreadRecord {
  return {
    id,
    societyId: society.id,
    authorId: "author-id",
    title,
    body: "body",
    status: "published",
    score: 0,
    commentCount: 0,
    createdAt: new Date("2026-01-02T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    deletedAt: null,
  };
}

const allowed = thread("thread-allow", "Allowed thread");
const review = thread("thread-review", "Review thread");
const none = thread("thread-none", "None thread");

class FakeDiscussionRepository {
  readonly threads = new Map<string, ThreadRecord>([
    [allowed.id, allowed],
    [review.id, review],
    [none.id, none],
  ]);
  readonly decisions = new Map<string, AnalysisDecision>([
    [allowed.id, "allow"],
    [review.id, "review"],
  ]);

  async listThreads(
    societyId: string,
    _page: PageRequest,
    _includeRetained: boolean,
  ): Promise<PageResult<ThreadRecord>> {
    const items = [...this.threads.values()].filter((t) => t.societyId === societyId);
    return { items, nextCursor: null, hasMore: false };
  }

  async listAllThreads(_page: PageRequest): Promise<PageResult<ThreadRecord>> {
    return { items: [...this.threads.values()], nextCursor: null, hasMore: false };
  }

  async listThreadMediaBatch(_threadIds: readonly string[]): Promise<readonly ThreadMediaRecord[]> {
    return [];
  }
}

class FakeMembershipRepository {
  async findMembership(
    societyId: string,
    userId: string,
  ): Promise<MembershipRecord | null> {
    if (societyId !== society.id) return null;
    if (userId === moderator.userId) {
      return {
        societyId,
        userId,
        role: "moderator",
        status: "active",
        joinedAt: new Date(),
        updatedAt: new Date(),
        bannedBy: null,
        bannedAt: null,
      };
    }
    if (userId === member.userId) {
      return {
        societyId,
        userId,
        role: "member",
        status: "active",
        joinedAt: new Date(),
        updatedAt: new Date(),
        bannedBy: null,
        bannedAt: null,
      };
    }
    return null;
  }
}

class FakeSocietyRepository {
  async findSocietyBySlug(slug: string): Promise<SocietyRecord | null> {
    return slug === society.slug ? society : null;
  }
  async findSocietiesByIds(ids: readonly string[]): Promise<readonly SocietyRecord[]> {
    return ids.includes(society.id) ? [society] : [];
  }
}

const profile: DiscussionProfilePort = {
  findPublicIdentity: async () => null,
  findPublicIdentities: async () => new Map(),
  canReadActivityBy: async () => true,
};

function createService(
  repository: FakeDiscussionRepository,
  decisions: ReadonlyMap<string, AnalysisDecision> = repository.decisions,
): FeedService {
  return new FeedService({
    repository: repository as unknown as DiscussionRepository,
    profile,
    membershipRepository: new FakeMembershipRepository() as unknown as MembershipRepository,
    societyRepository: new FakeSocietyRepository() as unknown as SocietyRepository,
    analysisDecisionReader: {
      findLatestDecisionsByThreads: async () => decisions,
    },
  });
}

describe("FeedService analysis queue", () => {
  it("requires society moderator authority for the society queue", async () => {
    const service = createService(new FakeDiscussionRepository());
    await expect(
      service.listSocietyAnalysisQueue(member, society.slug, { limit: 20 }),
    ).rejects.toMatchObject({ code: "SOCIETY_FORBIDDEN" });
  });

  it("lists only none/review threads for a moderator, defaulting to all", async () => {
    const service = createService(new FakeDiscussionRepository());
    const page = await service.listSocietyAnalysisQueue(moderator, society.slug, { limit: 20 });
    const ids = page.items.map((item) => item.id).sort();
    expect(ids).toEqual(["thread-none", "thread-review"]);
    expect(page.items.every((item) => item.analysisDecision !== "allow")).toBe(true);
  });

  it("filters the moderator queue by status", async () => {
    const service = createService(new FakeDiscussionRepository());
    const reviewOnly = await service.listSocietyAnalysisQueue(
      moderator, society.slug, { limit: 20 }, "review",
    );
    const noneOnly = await service.listSocietyAnalysisQueue(
      moderator, society.slug, { limit: 20 }, "none",
    );
    expect(reviewOnly.items.map((item) => item.id)).toEqual(["thread-review"]);
    expect(noneOnly.items.map((item) => item.id)).toEqual(["thread-none"]);
  });

  it("does not leak into the queue when every thread is allowed", async () => {
    const repository = new FakeDiscussionRepository();
    const decisions = new Map<string, AnalysisDecision>([[allowed.id, "allow"]]);
    const service = createService(repository, decisions);
    const page = await service.listSocietyAnalysisQueue(moderator, society.slug, { limit: 20 });
    // "review" and "none" still have no recorded decision here -> treated as none/review.
    expect(page.items.length).toBe(2);
  });

  it("requires system-admin for the global queue", async () => {
    const service = createService(new FakeDiscussionRepository());
    await expect(
      service.listGlobalAnalysisQueue(moderator, { limit: 20 }),
    ).rejects.toMatchObject({ code: "ADMIN_REQUIRED" });
  });

  it("lists none/review threads across all societies for a system admin", async () => {
    const service = createService(new FakeDiscussionRepository());
    const page = await service.listGlobalAnalysisQueue(admin, { limit: 20 });
    expect(page.items.map((item) => item.id).sort())
      .toEqual(["thread-none", "thread-review"]);
  });

  it("carries society slug and name on queue items", async () => {
    const service = createService(new FakeDiscussionRepository());
    const page = await service.listGlobalAnalysisQueue(admin, { limit: 20 });
    for (const item of page.items) {
      expect(item.societySlug).toBe(society.slug);
      expect(item.societyName).toBe(society.name);
    }
  });
});
