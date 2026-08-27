import { describe, expect, it } from "vitest";

import type { Clock } from "../../../shared/application/clock";
import type { RequestPrincipal } from "../../../shared/presentation/request-principal";
import type { IdentityAccountRecord } from "../../identity/domain/identity.types";
import type {
  AnalyticsMetricRecord,
  MetricPayload,
  MetricType,
} from "../domain/analytics";
import { AnalyticsService } from "./analytics.service";
import type {
  AnalyticsQuery,
  AnalyticsPageResult,
  AnalyticsRepository,
  UpsertAnalyticsMetricInput,
} from "./analytics.repository";

const now = new Date("2026-09-15T00:00:00.000Z");
const clock: Clock = { now: () => now };
const admin: RequestPrincipal = { userId: "admin-id", platformRole: "system_admin" };
const moderator: RequestPrincipal = { userId: "mod-id", platformRole: "student" };
const student: RequestPrincipal = { userId: "student-id", platformRole: "student" };
const societyId = "society-1";

describe("AnalyticsService", () => {
  it("rejects students without a society_id with ANALYTICS_FORBIDDEN", async () => {
    const service = createService();
    await expect(
      service.queryMetrics(student, {}),
    ).rejects.toMatchObject({ code: "ANALYTICS_FORBIDDEN" });

    await expect(
      service.queryMetrics(moderator, {}),
    ).rejects.toMatchObject({ code: "ANALYTICS_FORBIDDEN" });
  });

  it("rejects moderators of a society they don't moderate", async () => {
    const service = createService();
    await expect(
      service.queryMetrics(moderator, { societyId: "other-society" }),
    ).rejects.toMatchObject({ code: "ANALYTICS_SOCIETY_NOT_MODERATED" });
  });

  it("allows moderators access to their own society", async () => {
    const repository = new FakeAnalyticsRepository();
    repository.seed(platformMetric("user_growth", {
      registrations: 10,
      activeUsers: 50,
      totalUsers: 200,
      suspensions: 1,
    }, societyId));
    const service = createService(repository, true);
    const result = await service.queryMetrics(moderator, { societyId });

    expect(result.metrics).toHaveLength(1);
    expect(result.metrics[0]!).toMatchObject({
      metricType: "user_growth",
    });
  });

  it("allows admin access to all metrics", async () => {
    const repository = new FakeAnalyticsRepository();
    repository.seed(platformMetric("user_growth", {
      registrations: 10,
      activeUsers: 50,
      totalUsers: 200,
      suspensions: 1,
    }));
    repository.seed(platformMetric("content_volume", {
      threads: 100,
      comments: 500,
      votes: 1200,
      reports: 15,
    }));
    const service = createService(repository);

    const result = await service.queryMetrics(admin, {});
    expect(result.metrics).toHaveLength(2);
  });

  it("normalizes analytics payloads produced by the pipeline", async () => {
    const repository = new FakeAnalyticsRepository();
    repository.seed(platformMetric("user_growth", {
      registrations: 10,
      active_users: 8,
      total_users: 20,
      suspensions: 1,
    } as unknown as MetricPayload));
    repository.seed(platformMetric("top_societies", {
      top_by_members: [{
        society_id: societyId,
        name: "Engineering",
        member_count: 10,
        thread_count: 3,
      }],
      top_by_threads: [],
    } as unknown as MetricPayload));
    repository.seed(platformMetric("moderation", {
      pending_reports: 2,
      resolved_today: 1,
      avg_resolution_hours: 4.5,
      total_reports: 3,
    } as unknown as MetricPayload));

    const service = createService(repository);
    const result = await service.queryMetrics(admin, {});

    expect(result.metrics.map((metric) => metric.data)).toEqual(expect.arrayContaining([
      {
        registrations: 10,
        activeUsers: 8,
        totalUsers: 20,
        suspensions: 1,
      },
      {
        topByMembers: [{
          societyId,
          name: "Engineering",
          memberCount: 10,
          threadCount: 3,
        }],
        topByThreads: [],
      },
      {
        pendingReports: 2,
        resolvedToday: 1,
        avgResolutionHours: 4.5,
        totalReports: 3,
      },
    ]));
  });

  it("filters by metric_type", async () => {
    const repository = new FakeAnalyticsRepository();
    repository.seed(platformMetric("user_growth", {
      registrations: 10,
      activeUsers: 50,
      totalUsers: 200,
      suspensions: 1,
    }));
    repository.seed(platformMetric("content_volume", {
      threads: 100,
      comments: 500,
      votes: 1200,
      reports: 15,
    }));
    const service = createService(repository);

    const result = await service.queryMetrics(admin, {
      metricType: "user_growth",
    });
    expect(result.metrics).toHaveLength(1);
    expect(result.metrics[0]!.metricType).toBe("user_growth");
  });

  it("filters by period", async () => {
    const repository = new FakeAnalyticsRepository();
    repository.seed({
      ...platformMetric("user_growth", {
        registrations: 5,
        activeUsers: 20,
        totalUsers: 100,
        suspensions: 0,
      }),
      periodStart: new Date("2026-09-01"),
      periodEnd: new Date("2026-09-01"),
    });
    repository.seed({
      ...platformMetric("user_growth", {
        registrations: 10,
        activeUsers: 50,
        totalUsers: 200,
        suspensions: 1,
      }),
      periodStart: new Date("2026-09-02"),
      periodEnd: new Date("2026-09-02"),
    });
    const service = createService(repository);

    const result = await service.queryMetrics(admin, {
      periodStart: "2026-09-01T00:00:00.000Z",
      periodEnd: "2026-09-01T23:59:59.999Z",
    });
    expect(result.metrics).toHaveLength(1);
  });

  it("rejects non-admin refresh with ADMIN_REQUIRED", async () => {
    const service = createService();
    await expect(
      service.refresh(moderator),
    ).rejects.toMatchObject({ code: "ADMIN_REQUIRED" });
  });

  it("accepts admin refresh", async () => {
    let refreshCalled = false;
    const service = createService(
      undefined,
      false,
      async () => { refreshCalled = true; },
    );

    const response = await service.refresh(admin);
    expect(response.accepted).toBe(true);
    expect(refreshCalled).toBe(true);
  });

  it("accepts admin refresh without a publisher", async () => {
    const service = createService();
    const response = await service.refresh(admin);
    expect(response.accepted).toBe(true);
  });

  it("supports pagination", async () => {
    const repository = new FakeAnalyticsRepository();
    for (let i = 0; i < 25; i++) {
      repository.seed({
        ...platformMetric("user_growth", {
          registrations: i,
          activeUsers: i * 5,
          totalUsers: i * 10,
          suspensions: 0,
        }),
        periodStart: new Date(`2026-09-${String(i + 1).padStart(2, "0")}`),
        periodEnd: new Date(`2026-09-${String(i + 1).padStart(2, "0")}`),
      });
    }
    const service = createService(repository);

    const page1 = await service.queryMetrics(admin, { limit: 10 });
    expect(page1.metrics).toHaveLength(10);
    expect(page1.page.hasMore).toBe(true);
    expect(page1.page.cursor).not.toBeNull();
  });
});

function createService(
  repository?: AnalyticsRepository | undefined,
  isModeratorOfSociety = false,
  onRefreshRequested?: (() => Promise<void>) | undefined,
): AnalyticsService {
  return new AnalyticsService({
    repository: repository ?? new FakeAnalyticsRepository(),
    accountReader: { findAccountByUserId: findAccount },
    membershipRepository: {
      findMembership: async (socId: string, _userId: string) => {
        if (isModeratorOfSociety && socId === societyId) {
          return {
            societyId: socId,
            userId: moderator.userId,
            role: "moderator" as const,
            status: "active" as const,
            joinedAt: now,
            updatedAt: now,
            bannedBy: null,
            bannedAt: null,
          };
        }
        return null;
      },
    },
    clock,
    onRefreshRequested,
  });
}

async function findAccount(userId: string): Promise<IdentityAccountRecord | null> {
  if (userId === admin.userId) return account(admin.userId, "system_admin");
  if (userId === moderator.userId) return account(moderator.userId, "student");
  if (userId === student.userId) return account(student.userId, "student");
  return null;
}

function account(userId: string, platformRole: "student" | "system_admin"): IdentityAccountRecord {
  return {
    user: { id: userId, email: `${userId}@rmit.edu.au`, createdAt: now },
    profile: {
      userId,
      displayName: "Test",
      bio: null,
      avatarMediaId: null,
      platformRole,
      status: "active",
      isPublic: true,
      suspendedUntil: null,
      createdAt: now,
      updatedAt: now,
    },
  };
}

function platformMetric(
  metricType: MetricType,
  data: MetricPayload,
  societyId?: string | null,
): AnalyticsMetricRecord {
  return {
    id: crypto.randomUUID(),
    metricType,
    societyId: societyId ?? null,
    periodStart: new Date("2026-09-15"),
    periodEnd: new Date("2026-09-15"),
    data,
    createdAt: now,
    updatedAt: now,
  };
}

class FakeAnalyticsRepository implements AnalyticsRepository {
  private readonly records: AnalyticsMetricRecord[] = [];

  seed(record: AnalyticsMetricRecord): void {
    this.records.push(record);
  }

  async findMetrics(query: AnalyticsQuery): Promise<AnalyticsPageResult> {
    let filtered = [...this.records];

    if (query.metricType !== undefined) {
      filtered = filtered.filter((r) => r.metricType === query.metricType);
    }
    if (query.societyId !== undefined) {
      const sid = query.societyId === "null" ? null : query.societyId;
      filtered = filtered.filter((r) => r.societyId === sid);
    }
    if (query.periodStart !== undefined) {
      filtered = filtered.filter((r) => r.periodStart >= query.periodStart!);
    }
    if (query.periodEnd !== undefined) {
      filtered = filtered.filter((r) => r.periodEnd <= query.periodEnd!);
    }

    filtered.sort((a, b) => b.periodStart.getTime() - a.periodStart.getTime());

    const limit = query.limit ?? 20;
    const hasMore = filtered.length > limit;
    const items = filtered.slice(0, limit);

    return {
      metrics: items,
      nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null,
      hasMore,
    };
  }

  async upsertMetric(input: UpsertAnalyticsMetricInput): Promise<AnalyticsMetricRecord> {
    const record: AnalyticsMetricRecord = {
      id: input.id,
      metricType: input.metricType,
      societyId: input.societyId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      data: input.data,
      createdAt: input.createdAt,
      updatedAt: input.updatedAt,
    };
    const idx = this.records.findIndex(
      (r) =>
        r.metricType === record.metricType &&
        r.societyId === record.societyId &&
        r.periodStart.getTime() === record.periodStart.getTime(),
    );
    if (idx >= 0) {
      this.records[idx] = record;
    } else {
      this.records.push(record);
    }
    return record;
  }

  async upsertMetrics(
    inputs: readonly UpsertAnalyticsMetricInput[],
  ): Promise<readonly AnalyticsMetricRecord[]> {
    const records: AnalyticsMetricRecord[] = [];
    for (const input of inputs) records.push(await this.upsertMetric(input));
    return records;
  }

  async findLatestPeriod(): Promise<Date | null> {
    if (this.records.length === 0) return null;
    return this.records.reduce((latest, r) =>
      r.periodStart > latest.periodStart ? r : latest,
    ).periodStart;
  }
}
