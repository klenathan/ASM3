import { describe, expect, it } from "vitest";

import { outputPathFromEvent } from "./load-results/handler";
import { stagingPathFromEvent } from "./start-emr/handler";

describe("analytics S3 completion events", () => {
  it("derives staging path from dump completion marker", () => {
    expect(stagingPathFromEvent(s3Event("analytics/staging/20260827T173900/_SUCCESS")))
      .toBe("analytics/staging/20260827T173900");
  });

  it("derives output path from Spark completion marker", () => {
    expect(outputPathFromEvent(s3Event("analytics/output/20260827T173900/metrics.jsonl/_SUCCESS")))
      .toBe("analytics/output/20260827T173900");
  });
});

function s3Event(key: string): Record<string, unknown> {
  return {
    Records: [{ s3: { object: { key } } }],
  };
}
