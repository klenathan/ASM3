import { describe, expect, it } from "vitest";

import { ATHENA_METRIC_SQL, METRIC_SQL_TYPES } from "./athena-sql-catalog";

describe("ATHENA_METRIC_SQL", () => {
  it("defines one query for every persisted metric group", () => {
    expect(Object.keys(ATHENA_METRIC_SQL).sort()).toEqual([...METRIC_SQL_TYPES].sort());
    for (const sql of Object.values(ATHENA_METRIC_SQL)) {
      expect(sql).toContain("metric_type");
      expect(sql).toContain("society_id");
      expect(sql).toContain("period_start");
      expect(sql).toContain("period_end");
      expect(sql).toContain(" AS data");
    }
  });
});
