import pino from "pino";
import { describe, expect, it, vi } from "vitest";

import { ReanalysisWorker } from "./reanalysis.worker";
import type { ReanalysisMessageSource } from "./reanalysis-queue.port";

const logger = pino({ level: "silent" });

describe("ReanalysisWorker", () => {
  it("runs a valid job and acknowledges it after completion", async () => {
    let receiveCount = 0;
    const source: ReanalysisMessageSource = {
      receive: async (signal) => {
        receiveCount += 1;
        if (receiveCount === 1) {
          return [{
            receiptHandle: "receipt-1",
            body: JSON.stringify({
              jobId: "22222222-2222-4222-8222-222222222222",
              jobType: "thread.reanalysis.requested",
              version: 1,
              threadId: "11111111-1111-4111-8111-111111111111",
              requestedAt: "2026-08-04T00:00:00.000Z",
            }),
          }];
        }
        return new Promise((resolve) => {
          signal.addEventListener("abort", () => resolve([]), { once: true });
        });
      },
      acknowledge: vi.fn(async () => undefined),
    };
    const reanalyzeThread = vi.fn(async () => null);
    const worker = new ReanalysisWorker({
      source,
      runner: { reanalyzeThread },
      logger,
    });

    const loop = worker.start();
    await vi.waitFor(() => expect(reanalyzeThread).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
    ));
    await worker.stop();
    await loop;

    expect(source.acknowledge).toHaveBeenCalledWith("receipt-1");
  });

  it("leaves a job unacknowledged when the runner fails", async () => {
    let receiveCount = 0;
    const source: ReanalysisMessageSource = {
      receive: async (signal) => {
        receiveCount += 1;
        if (receiveCount === 1) {
          return [{
            receiptHandle: "receipt-1",
            body: JSON.stringify({
              jobId: "22222222-2222-4222-8222-222222222222",
              jobType: "thread.reanalysis.requested",
              version: 1,
              threadId: "11111111-1111-4111-8111-111111111111",
              requestedAt: "2026-08-04T00:00:00.000Z",
            }),
          }];
        }
        return new Promise((resolve) => {
          signal.addEventListener("abort", () => resolve([]), { once: true });
        });
      },
      acknowledge: vi.fn(async () => undefined),
    };
    const worker = new ReanalysisWorker({
      source,
      runner: {
        reanalyzeThread: vi.fn(async () => {
          throw new Error("database unavailable");
        }),
      },
      logger,
    });

    const loop = worker.start();
    await vi.waitFor(() => expect(receiveCount).toBeGreaterThanOrEqual(2));
    await worker.stop();
    await loop;

    expect(source.acknowledge).not.toHaveBeenCalled();
  });
});
