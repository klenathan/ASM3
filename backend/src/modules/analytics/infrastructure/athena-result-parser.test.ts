import { describe, expect, it } from "vitest";

import { parseAthenaResultRows } from "./athena-result-parser";

describe("parseAthenaResultRows", () => {
  const columns = [
    "metric_type",
    "society_id",
    "period_start",
    "period_end",
    "data",
  ];

  it("skips the Athena header and maps rows into repository values", () => {
    const rows = [
      columns,
      [
        "user_growth",
        "",
        "2026-08-27T00:00:00.000Z",
        "2026-08-27T23:59:59.999Z",
        '{"registrations":12,"activeUsers":10,"totalUsers":30,"suspensions":1}',
      ],
    ];

    expect(parseAthenaResultRows(columns, rows)).toEqual([
      {
        metricType: "user_growth",
        societyId: null,
        periodStart: new Date("2026-08-27T00:00:00.000Z"),
        periodEnd: new Date("2026-08-27T23:59:59.999Z"),
        data: {
          registrations: 12,
          activeUsers: 10,
          totalUsers: 30,
          suspensions: 1,
        },
      },
    ]);
  });

  it("rejects malformed metric rows instead of persisting partial data", () => {
    expect(() =>
      parseAthenaResultRows(columns, [
        ["unknown_metric", "", "2026-08-27", "2026-08-27", "{}"],
      ]),
    ).toThrow("Invalid metric type");
  });
});
