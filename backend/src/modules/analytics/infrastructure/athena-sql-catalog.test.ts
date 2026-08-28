import { describe, expect, it } from "vitest";

import { createAthenaMetricSqlCatalog, METRIC_SQL_TYPES } from "./athena-sql-catalog";

describe("ATHENA_METRIC_SQL", () => {
  it("defines one query for every persisted metric group", () => {
    const snapshotId = "123e4567-e89b-12d3-a456-426614174000";
    const catalog = createAthenaMetricSqlCatalog(snapshotId);
    expect(Object.keys(catalog).sort()).toEqual([...METRIC_SQL_TYPES].sort());
    for (const sql of Object.values(catalog)) {
      expect(sql).toContain("metric_type");
      expect(sql).toContain("society_id");
      expect(sql).toContain("period_start");
      expect(sql).toContain("period_end");
      expect(sql).toContain(
        "date_add('millisecond', -1, date_add('day', 1, CAST(current_date AS timestamp))) AS period_end",
      );
      expect(sql).not.toContain("+ INTERVAL '1' DAY - INTERVAL '1' MILLISECOND AS period_end");
      expect(sql).toContain(" AS data");
      expect(sql).toContain(`WHERE snapshot_id = CAST('${snapshotId}' AS varchar)`);
    }
  });

  it("rejects an unsafe snapshot id before constructing SQL", () => {
    expect(() => createAthenaMetricSqlCatalog("' OR 1 = 1 --")).toThrow(/UUID/);
  });

  it("includes society dimensions for every content-volume source", () => {
    const sql = createAthenaMetricSqlCatalog("123e4567-e89b-12d3-a456-426614174000").content_volume!;
    expect(sql).toContain("FROM latest_votes GROUP BY society_id");
    expect(sql).toContain("FROM latest_reports GROUP BY society_id");
  });
});
