import { describe, expect, it } from "vitest";

import { validateQueryIds } from "./drizzle-refresh-run.store";

describe("validateQueryIds", () => {
  const runId = "adadcc95-0441-4667-a03a-a9eb16fbc934";

  it("accepts contract v2 action metric query execution IDs", () => {
    const queryIds = {
      activity: "29dcbba7-5d72-4be5-bd97-88286da45f58",
      current_state: "00d804f8-8f30-40d3-b7f3-684274cad847",
      reconciliation: "c5694ad9-9278-4130-9d3c-8657b50da50a",
    };

    expect(validateQueryIds(queryIds, runId)).toEqual({
      activity: "29dcbba7-5d72-4be5-bd97-88286da45f58",
      current_state: "00d804f8-8f30-40d3-b7f3-684274cad847",
      reconciliation: "c5694ad9-9278-4130-9d3c-8657b50da50a",
    });
  });

  it("accepts legacy v1 metric types", () => {
    const queryIds = {
      user_growth: "query-1",
      content_volume: "query-2",
      top_societies: "query-3",
      moderation: "query-4",
    };

    expect(validateQueryIds(queryIds, runId)).toEqual({
      user_growth: "query-1",
      content_volume: "query-2",
      top_societies: "query-3",
      moderation: "query-4",
    });
  });

  it("accepts an empty query map", () => {
    expect(validateQueryIds({}, runId)).toEqual({});
  });

  it("rejects unknown metric keys", () => {
    const invalid = {
      not_a_metric: "query-123",
    };

    expect(() => validateQueryIds(invalid, runId)).toThrowError(
      `invalid Athena query id map for refresh run ${runId}`,
    );
  });

  it("rejects non-string query execution IDs", () => {
    const invalid = {
      activity: 12345,
    };

    expect(() => validateQueryIds(invalid, runId)).toThrowError(
      `invalid Athena query id map for refresh run ${runId}`,
    );
  });

  it("rejects empty string query execution IDs", () => {
    const invalid = {
      activity: "",
    };

    expect(() => validateQueryIds(invalid, runId)).toThrowError(
      `invalid Athena query id map for refresh run ${runId}`,
    );
  });

  it("rejects null, array, and non-object inputs", () => {
    expect(() => validateQueryIds(null, runId)).toThrowError(
      `invalid Athena query id map for refresh run ${runId}`,
    );
    expect(() => validateQueryIds([], runId)).toThrowError(
      `invalid Athena query id map for refresh run ${runId}`,
    );
    expect(() => validateQueryIds("query-1", runId)).toThrowError(
      `invalid Athena query id map for refresh run ${runId}`,
    );
    expect(() => validateQueryIds(123, runId)).toThrowError(
      `invalid Athena query id map for refresh run ${runId}`,
    );
  });
});
