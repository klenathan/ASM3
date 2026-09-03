import { describe, expect, it } from "vitest";

import { createActionAthenaSqlCatalog } from "./action-athena-sql-catalog";
import { ACTION_EVENT_TYPES } from "../domain/action-event";

describe("createActionAthenaSqlCatalog", () => {
  it("casts every ROW payload to JSON before json_format", () => {
    const catalog = createActionAthenaSqlCatalog(
      "123e4567-e89b-12d3-a456-426614174000",
      "2026-09-03",
      "2026-09-04",
    );

    for (const sql of Object.values(catalog)) {
      expect(sql).not.toContain("json_format(CAST(ROW(");
      expect(sql).toContain("json_format(CAST(CAST(ROW(");
    }
  });
  it("aliases temporal output columns to the action parser contract", () => {
    const catalog = createActionAthenaSqlCatalog(
      "123e4567-e89b-12d3-a456-426614174000",
      "2026-09-03",
      "2026-09-04",
    );

    for (const sql of Object.values(catalog)) {
      expect(sql).toContain("CAST('2026-09-03' AS timestamp) AS period_start");
      expect(sql).toContain("CAST('2026-09-04' AS timestamp) AS period_end");
    }
  });

  it("emits a complete event-count object for activity metrics", () => {
    const sql = createActionAthenaSqlCatalog(
      "123e4567-e89b-12d3-a456-426614174000",
      "2026-09-03",
      "2026-09-04",
    ).activity;

    expect(sql).not.toContain("json_parse('{}')");
    for (const eventType of ACTION_EVENT_TYPES) {
      expect(sql).toContain(`count_if(event_type = '${eventType}')`);
    }
  });
});
