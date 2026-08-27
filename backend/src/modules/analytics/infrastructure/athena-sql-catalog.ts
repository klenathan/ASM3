import { METRIC_TYPES } from "../domain/analytics";
import type { MetricSqlCatalog, MetricSqlCatalogFactory } from "../application/refresh-orchestrator.ports";

const PERIOD_COLUMNS = `
  CAST(current_date AS timestamp) AS period_start,
  CAST(current_date AS timestamp) + INTERVAL '1' DAY - INTERVAL '1' MILLISECOND AS period_end`;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Athena queries intentionally return one stable row shape for every metric
 * group. The JSON payload uses the persisted snake_case keys; the application
 * service is responsible for exposing the API's camelCase representation.
 *
 * The run ID is also the Glue snapshot ID. It is validated before being put in
 * a SQL literal so an overlapping run can never select another run's files.
 */
export const createAthenaMetricSqlCatalog: MetricSqlCatalogFactory = (snapshotId) => {
  const snapshot = snapshotLiteral(snapshotId);
  const latestSnapshot = `latest AS (
   SELECT snapshot_at, snapshot_id FROM analytics.snapshot_manifest
   WHERE snapshot_id = ${snapshot}
   ORDER BY completed_at DESC
   LIMIT 1
 )`;

  const catalog: MetricSqlCatalog = {
    user_growth: `
 WITH ${latestSnapshot}, current_users AS (
   SELECT u.* FROM analytics.users u
   JOIN latest l ON u.snapshot_at = l.snapshot_at AND u.snapshot_id = l.snapshot_id
 )
 SELECT
   'user_growth' AS metric_type,
   CAST(NULL AS varchar) AS society_id,
   ${PERIOD_COLUMNS},
   json_format(CAST(CAST(ROW(
     count(*),
     count_if(status = 'active'),
     count(*),
     count_if(status = 'suspended')
   ) AS ROW(registrations BIGINT, active_users BIGINT, total_users BIGINT, suspensions BIGINT)) AS JSON)) AS data
 FROM current_users`,

    content_volume: `
 WITH ${latestSnapshot}, latest_threads AS (
   SELECT t.* FROM analytics.threads t
   JOIN latest l ON t.snapshot_at = l.snapshot_at AND t.snapshot_id = l.snapshot_id
 ), latest_comments AS (
   SELECT c.* FROM analytics.comments c
   JOIN latest l ON c.snapshot_at = l.snapshot_at AND c.snapshot_id = l.snapshot_id
 ), latest_votes AS (
   SELECT v.* FROM analytics.votes v
   JOIN latest l ON v.snapshot_at = l.snapshot_at AND v.snapshot_id = l.snapshot_id
 ), latest_reports AS (
   SELECT r.* FROM analytics.reports r
   JOIN latest l ON r.snapshot_at = l.snapshot_at AND r.snapshot_id = l.snapshot_id
 ), society_counts AS (
   SELECT society_id, count(*) AS threads, 0 AS comments, 0 AS votes, 0 AS reports
   FROM latest_threads GROUP BY society_id
   UNION ALL
   SELECT society_id, 0, count(*), 0, 0
   FROM latest_comments GROUP BY society_id
   UNION ALL
   SELECT society_id, 0, 0, count(*), 0
   FROM latest_votes GROUP BY society_id
   UNION ALL
   SELECT society_id, 0, 0, 0, count(*)
   FROM latest_reports GROUP BY society_id
 )
 SELECT
   'content_volume' AS metric_type,
   CAST(NULL AS varchar) AS society_id,
   ${PERIOD_COLUMNS},
   json_format(CAST(CAST(ROW(
     (SELECT count(*) FROM latest_threads),
     (SELECT count(*) FROM latest_comments),
     (SELECT count(*) FROM latest_votes),
     (SELECT count(*) FROM latest_reports)
   ) AS ROW(threads BIGINT, comments BIGINT, votes BIGINT, reports BIGINT)) AS JSON)) AS data
 UNION ALL
 SELECT
   'content_volume',
   society_id,
   ${PERIOD_COLUMNS},
   json_format(CAST(CAST(ROW(
     sum(threads), sum(comments), sum(votes), sum(reports)
   ) AS ROW(threads BIGINT, comments BIGINT, votes BIGINT, reports BIGINT)) AS JSON))
 FROM society_counts
 GROUP BY society_id`,

    top_societies: `
 WITH ${latestSnapshot}, latest_societies AS (
   SELECT s.* FROM analytics.societies s
   JOIN latest l ON s.snapshot_at = l.snapshot_at AND s.snapshot_id = l.snapshot_id
 ), society_stats AS (
   SELECT
     s.id AS society_id,
     s.name,
     count(DISTINCT m.user_id) AS member_count,
     count(DISTINCT t.id) AS thread_count
   FROM latest_societies s
   LEFT JOIN analytics.memberships m
     ON m.society_id = s.id
    AND m.status = 'active'
    AND m.snapshot_at = (SELECT snapshot_at FROM latest)
    AND m.snapshot_id = (SELECT snapshot_id FROM latest)
   LEFT JOIN analytics.threads t
     ON t.society_id = s.id
    AND t.snapshot_at = (SELECT snapshot_at FROM latest)
    AND t.snapshot_id = (SELECT snapshot_id FROM latest)
   GROUP BY s.id, s.name
 ), top_members AS (
   SELECT * FROM society_stats ORDER BY member_count DESC, society_id LIMIT 10
 ), top_threads AS (
   SELECT * FROM society_stats ORDER BY thread_count DESC, society_id LIMIT 10
 )
 SELECT
   'top_societies' AS metric_type,
   CAST(NULL AS varchar) AS society_id,
   ${PERIOD_COLUMNS},
   json_format(CAST(ROW(
       json_parse(concat('[', coalesce((SELECT array_join(array_agg(
       json_format(CAST(CAST(ROW(society_id, name, member_count, thread_count) AS ROW(society_id VARCHAR, name VARCHAR, member_count BIGINT, thread_count BIGINT)) AS JSON))
       ORDER BY member_count DESC, society_id), ',') FROM top_members)), ''), ']')),
       json_parse(concat('[', coalesce((SELECT array_join(array_agg(
       json_format(CAST(CAST(ROW(society_id, name, member_count, thread_count) AS ROW(society_id VARCHAR, name VARCHAR, member_count BIGINT, thread_count BIGINT)) AS JSON))
       ORDER BY thread_count DESC, society_id), ',') FROM top_threads)), ''), ']'))
   ) AS ROW(top_by_members JSON, top_by_threads JSON)) AS JSON)) AS data`,

    moderation: `
 WITH ${latestSnapshot}, latest_reports AS (
   SELECT r.* FROM analytics.reports r
   JOIN latest l ON r.snapshot_at = l.snapshot_at AND r.snapshot_id = l.snapshot_id
 ), society_metrics AS (
   SELECT
     society_id,
     count_if(status = 'pending') AS pending_reports,
     count_if(status = 'resolved' AND resolved_at >= current_date) AS resolved_today,
     coalesce(avg(IF(status = 'resolved' AND resolved_at IS NOT NULL,
       date_diff('second', created_at, resolved_at) / 3600.0, NULL)), 0.0) AS avg_resolution_hours,
     count(*) AS total_reports
   FROM latest_reports
   GROUP BY society_id
 )
 SELECT
   'moderation' AS metric_type,
   CAST(NULL AS varchar) AS society_id,
   ${PERIOD_COLUMNS},
   json_format(CAST(CAST(ROW(
   (SELECT count_if(status = 'pending') FROM latest_reports),
   (SELECT count_if(status = 'resolved' AND resolved_at >= current_date) FROM latest_reports),
     (SELECT coalesce(avg(IF(status = 'resolved' AND resolved_at IS NOT NULL,
       date_diff('second', created_at, resolved_at) / 3600.0, NULL)), 0.0) FROM latest_reports),
     (SELECT count(*) FROM latest_reports)
   ) AS ROW(pending_reports BIGINT, resolved_today BIGINT, avg_resolution_hours DOUBLE, total_reports BIGINT)) AS JSON)) AS data
 UNION ALL
 SELECT
   'moderation', society_id, ${PERIOD_COLUMNS},
   json_format(CAST(CAST(ROW(pending_reports, resolved_today, avg_resolution_hours, total_reports)
     AS ROW(pending_reports BIGINT, resolved_today BIGINT, avg_resolution_hours DOUBLE, total_reports BIGINT)) AS JSON))
 FROM society_metrics`,
  };
  return catalog;
};

function snapshotLiteral(snapshotId: string): string {
  if (!UUID_PATTERN.test(snapshotId)) {
    throw new Error("analytics snapshot id must be a UUID");
  }
  return `CAST('${snapshotId.replaceAll("'", "''")}' AS varchar)`;
}

export const METRIC_SQL_TYPES = METRIC_TYPES;
