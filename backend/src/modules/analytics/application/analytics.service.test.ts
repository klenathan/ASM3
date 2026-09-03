import { describe, expect, it } from "vitest";

import type { Clock } from "../../../shared/application/clock";
import type { RequestPrincipal } from "../../../shared/presentation/request-principal";
import type { IdentityAccountRecord } from "../../identity/domain/identity.types";
import type { RefreshRange } from "./refresh-range";
import type { RefreshRunRecord, RefreshRunStore } from "./refresh-run.ports";
import type { RequestRefreshResult } from "./refresh-workflow";
import { AnalyticsService } from "./analytics.service";

const now = new Date("2026-09-15T00:00:00.000Z");
const clock: Clock = { now: () => now };
const admin: RequestPrincipal = { userId: "admin-id", platformRole: "system_admin" };
const moderator: RequestPrincipal = { userId: "mod-id", platformRole: "student" };

describe("AnalyticsService", () => {
  it("rejects non-admin refresh with ADMIN_REQUIRED", async () => {
    await expect(createService().refresh(moderator)).rejects.toMatchObject({ code: "ADMIN_REQUIRED" });
  });

  it("accepts an admin refresh", async () => {
    let refreshCalled = false;
    const service = createService({
      onRefreshRequested: async () => {
        refreshCalled = true;
        return { runId: "123e4567-e89b-12d3-a456-426614174000", status: "requested", coalesced: false };
      },
    });

    await expect(service.refresh(admin)).resolves.toMatchObject({ accepted: true });
    expect(refreshCalled).toBe(true);
  });

  it("clamps refresh ranges before the recording boundary", async () => {
    let requestedRange: RefreshRange | undefined;
    const service = createService({
      recordingStartedAt: new Date("2026-09-03T14:00:00.000Z"),
      onRefreshRequested: async (range) => {
        requestedRange = range;
        return {
          runId: "123e4567-e89b-12d3-a456-426614174000",
          status: "requested",
          coalesced: false,
          ...(range === undefined ? {} : range),
        };
      },
    });

    const response = await service.refresh(admin, { periodStart: "2026-09-01", periodEnd: "2026-09-08" });

    expect(requestedRange).toEqual({ periodStart: "2026-09-03", periodEnd: "2026-09-08" });
    expect(response.warnings).toEqual([
      "Requested range starts before retained action events; skipped dates before 2026-09-03.",
    ]);
  });

  it("returns the latest durable refresh status to system admins", async () => {
    const latestRun: RefreshRunRecord = {
      runId: "123e4567-e89b-12d3-a456-426614174000",
      trigger: "admin",
      status: "querying",
      attempts: 1,
      lastError: null,
      createdAt: now,
      updatedAt: now,
      glueJobRunId: "jr_1",
      athenaQueryExecutionIds: {},
    };

    await expect(createService({ runStore: { findLatestRun: async () => latestRun } }).refreshStatus(admin)).resolves.toEqual({
      runId: latestRun.runId,
      trigger: "admin",
      status: "querying",
      attempts: 1,
      lastError: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
  });

  it("cancels the latest queued refresh", async () => {
    let persisted: RefreshRunRecord = {
      runId: "123e4567-e89b-12d3-a456-426614174000",
      trigger: "admin",
      status: "querying",
      attempts: 1,
      lastError: null,
      createdAt: now,
      updatedAt: now,
      glueJobRunId: "jr_1",
      athenaQueryExecutionIds: {},
    };
    let stopped = false;
    const runStore = {
      findLatestRun: async () => persisted,
      findActiveRun: async () => persisted.status === "querying" ? persisted : null,
      get: async () => persisted,
      save: async (run: RefreshRunRecord) => { persisted = run; return run; },
    };
    const service = createService({ runStore, onRefreshCancelled: async () => { stopped = true; } });

    await expect(service.cancelLatestRefresh(admin)).resolves.toMatchObject({ cancelled: true, status: "cancelled" });
    expect(stopped).toBe(true);
    expect(persisted.status).toBe("cancelled");
  });

  it("validates scheduled refresh secrets and forwards valid requests", async () => {
    let scheduled = false;
    const service = createService({
      schedulerSecret: "scheduler-secret",
      onScheduledRefresh: async () => {
        scheduled = true;
        return { runId: "123e4567-e89b-12d3-a456-426614174000", status: "requested", coalesced: false };
      },
    });

    await expect(service.scheduledRefresh(undefined)).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
    await expect(service.scheduledRefresh("scheduler-secret")).resolves.toMatchObject({ accepted: true });
    expect(scheduled).toBe(true);
  });
});

interface ServiceOptions {
  readonly recordingStartedAt?: Date;
  readonly onRefreshRequested?: ((range?: RefreshRange) => Promise<RequestRefreshResult | void>);
  readonly schedulerSecret?: string;
  readonly onScheduledRefresh?: (() => Promise<RequestRefreshResult>);
  readonly runStore?: Pick<RefreshRunStore, "findLatestRun"> & Partial<Pick<RefreshRunStore, "findActiveRun" | "get" | "save">>;
  readonly onRefreshCancelled?: ((run: RefreshRunRecord) => Promise<void>);
}

function createService(options: ServiceOptions = {}): AnalyticsService {
  return new AnalyticsService({
    actionMetricsRepository: {
      findActionMetrics: async () => ({ metrics: [], nextCursor: null, hasMore: false }),
      upsertActionMetrics: async () => undefined,
      ...(options.recordingStartedAt === undefined ? {} : { getRecordingStartedAt: async () => options.recordingStartedAt! }),
    },
    accountReader: { findAccountByUserId: findAccount },
    clock,
    runStore: options.runStore,
    onRefreshRequested: options.onRefreshRequested,
    onRefreshCancelled: options.onRefreshCancelled,
    schedulerSecret: options.schedulerSecret,
    onScheduledRefresh: options.onScheduledRefresh,
  });
}

async function findAccount(userId: string): Promise<IdentityAccountRecord | null> {
  if (userId === admin.userId) return account(admin.userId, "system_admin");
  if (userId === moderator.userId) return account(moderator.userId, "student");
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
