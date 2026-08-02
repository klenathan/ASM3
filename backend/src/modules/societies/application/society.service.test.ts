import { describe, expect, it } from "vitest";

import type { Clock } from "../../../shared/application/clock.js";
import type { TransactionManager } from "../../../shared/application/transaction.js";
import type { RequestPrincipal } from "../../../shared/presentation/request-principal.js";
import type {
  CreateMembershipInput,
  MembershipRepository,
  UpdateMembershipInput,
} from "./membership.repository.js";
import { MembershipService } from "./membership.service.js";
import type { MembershipRecord } from "../domain/membership.js";
import type {
  CreateRuleInput,
  CreateSocietyInput,
  SocietyRepository,
  UpdateRuleInput,
} from "./society.repository.js";
import { SocietyService } from "./society.service.js";
import type { SocietyRecord, SocietyRuleRecord } from "../domain/society.js";
import type { PageRequest, PageResult } from "../../../shared/application/pagination.js";

const society: SocietyRecord = {
  id: "society-id",
  slug: "cloud",
  name: "Cloud Computing",
  description: "Cloud Computing students",
  status: "active",
  createdBy: "admin-id",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

const now = new Date("2026-01-02T00:00:00.000Z");
const clock: Clock = { now: () => now };
const student: RequestPrincipal = { userId: "student-id", platformRole: "student" };
const moderator: RequestPrincipal = { userId: "moderator-id", platformRole: "student" };
const admin: RequestPrincipal = { userId: "admin-id", platformRole: "system_admin" };

describe("SocietyService", () => {
  it("allows only system admins to create societies", async () => {
    const repository = new FakeSocietyRepository();
    const service = new SocietyService({
      repository,
      membershipRepository: new FakeMembershipRepository(),
      transactions: immediateTransaction(repository),
      clock,
    });

    await expect(
      service.createSociety(student, {
        slug: "new-society",
        name: "New Society",
        description: "A new society",
      }),
    ).rejects.toMatchObject({ code: "SOCIETY_FORBIDDEN" });

    const created = await service.createSociety(admin, {
      slug: "new-society",
      name: "New Society",
      description: "A new society",
    });
    expect(created.slug).toBe("new-society");
    expect(repository.createdBy).toBe(admin.userId);
  });

  it("uses an active society moderator rather than platform role for rules", async () => {
    const repository = new FakeSocietyRepository(society);
    const memberships = new FakeMembershipRepository([
      membership(student.userId, "member"),
      membership(moderator.userId, "moderator"),
    ]);
    const service = new SocietyService({
      repository,
      membershipRepository: memberships,
      transactions: immediateTransaction(repository),
      clock,
    });

    await expect(
      service.createRule(student, society.id, {
        position: 1,
        title: "Be respectful",
        description: "Keep discussion constructive",
      }),
    ).rejects.toMatchObject({ code: "SOCIETY_FORBIDDEN" });

    await expect(
      service.createRule(moderator, society.id, {
        position: 1,
        title: "Be respectful",
        description: "Keep discussion constructive",
      }),
    ).resolves.toMatchObject({ position: 1 });
  });
});

describe("MembershipService", () => {
  it("does not allow the last active moderator to leave or be removed", async () => {
    const societies = new FakeSocietyRepository(society);
    const memberships = new FakeMembershipRepository([membership(moderator.userId, "moderator")]);
    const service = new MembershipService({
      repository: memberships,
      societyRepository: societies,
      transactions: immediateTransaction(memberships),
      clock,
    });

    await expect(service.leave(moderator, society.id)).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      service.removeModerator(moderator, society.id, moderator.userId),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await memberships.findMembership(society.id, moderator.userId))?.role).toBe("moderator");
  });

  it("grants moderator authority through an active membership", async () => {
    const societies = new FakeSocietyRepository(society);
    const memberships = new FakeMembershipRepository([membership(moderator.userId, "moderator")]);
    const service = new MembershipService({
      repository: memberships,
      societyRepository: societies,
      transactions: immediateTransaction(memberships),
      clock,
    });

    const result = await service.addModerator(moderator, society.id, { userId: student.userId });
    expect(result).toMatchObject({ userId: student.userId, role: "moderator", status: "active" });
    expect(await service.hasModeratorAuthority(student, society.id)).toBe(true);
  });
});

class FakeSocietyRepository implements SocietyRepository {
  private readonly societies = new Map<string, SocietyRecord>();
  private readonly rules = new Map<string, SocietyRuleRecord>();
  createdBy: string | null = null;

  constructor(initial?: SocietyRecord) {
    if (initial !== undefined) this.societies.set(initial.id, initial);
  }

  async listSocieties(_page: PageRequest): Promise<PageResult<SocietyRecord>> {
    return { items: [...this.societies.values()], nextCursor: null, hasMore: false };
  }

  async findSocietyById(societyId: string): Promise<SocietyRecord | null> {
    return this.societies.get(societyId) ?? null;
  }

  async findSocietyBySlug(slug: string): Promise<SocietyRecord | null> {
    return [...this.societies.values()].find((item) => item.slug === slug) ?? null;
  }

  async createSociety(input: CreateSocietyInput): Promise<SocietyRecord> {
    const created = { ...input, status: "active" as const };
    this.societies.set(created.id, created);
    this.createdBy = created.createdBy;
    return created;
  }

  async listRules(societyId: string): Promise<readonly SocietyRuleRecord[]> {
    return [...this.rules.values()].filter((rule) => rule.societyId === societyId);
  }

  async findRuleById(societyId: string, ruleId: string): Promise<SocietyRuleRecord | null> {
    const rule = this.rules.get(ruleId);
    return rule?.societyId === societyId ? rule : null;
  }

  async createRule(input: CreateRuleInput): Promise<SocietyRuleRecord> {
    const rule = { ...input };
    this.rules.set(rule.id, rule);
    return rule;
  }

  async updateRule(
    societyId: string,
    ruleId: string,
    input: UpdateRuleInput,
  ): Promise<SocietyRuleRecord | null> {
    const current = await this.findRuleById(societyId, ruleId);
    if (current === null) return null;
    const updated = { ...current, ...input };
    this.rules.set(ruleId, updated);
    return updated;
  }

  async deleteRule(societyId: string, ruleId: string): Promise<boolean> {
    const current = await this.findRuleById(societyId, ruleId);
    return current === null ? false : this.rules.delete(ruleId);
  }
}

class FakeMembershipRepository implements MembershipRepository {
  private readonly memberships = new Map<string, MembershipRecord>();

  constructor(initial: readonly MembershipRecord[] = []) {
    for (const item of initial) this.memberships.set(key(item.societyId, item.userId), item);
  }

  async findMembership(societyId: string, userId: string): Promise<MembershipRecord | null> {
    return this.memberships.get(key(societyId, userId)) ?? null;
  }

  async countActiveModerators(societyId: string): Promise<number> {
    return [...this.memberships.values()].filter(
      (item) => item.societyId === societyId && item.status === "active" && item.role === "moderator",
    ).length;
  }

  async createMembership(input: CreateMembershipInput): Promise<MembershipRecord> {
    const created: MembershipRecord = { ...input, bannedBy: null, bannedAt: null };
    this.memberships.set(key(created.societyId, created.userId), created);
    return created;
  }

  async updateMembership(
    societyId: string,
    userId: string,
    input: UpdateMembershipInput,
  ): Promise<MembershipRecord | null> {
    const current = await this.findMembership(societyId, userId);
    if (current === null) return null;
    const updated: MembershipRecord = { ...current, ...input };
    this.memberships.set(key(societyId, userId), updated);
    return updated;
  }
}

function membership(userId: string, role: "member" | "moderator"): MembershipRecord {
  return {
    societyId: society.id,
    userId,
    role,
    status: "active",
    joinedAt: now,
    updatedAt: now,
    bannedBy: null,
    bannedAt: null,
  };
}

function immediateTransaction<T>(repository: T): TransactionManager<T> {
  return { withTransaction: async (work) => work(repository) };
}

function key(societyId: string, userId: string): string {
  return `${societyId}:${userId}`;
}
