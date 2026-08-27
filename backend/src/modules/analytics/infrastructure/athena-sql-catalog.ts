import type { MetricSqlCatalog } from "../application/refresh-orchestrator.ports";

const PERIOD_COLUMNS = `
  CAST(current_date AS timestamp) AS period_start,
  CAST(current_date AS timestamp) + INTERVAL '1' DAY - INTERVAL '1' MILLISECOND AS period_end`;

/**
 * Athena queries intentionally return one stable row shape for every metric
 * group. The JSON payload uses the persisted snake_case keys; the application
 * service is responsible for exposing the API's camelCase representation.
 */
export const ATHENA_METRIC_SQL: MetricSqlCatalog = {
  user_growth: `
WITH latest AS (
  SELECT max(snapshot_at) AS snapshot_at FROM analytics.users
), current_users AS (
  SELECT u.* FROM analytics.users u
  JOIN latest l ON u.snapshot_at = l.snapshot_at
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
WITH latest_threads AS (
  SELECT t.* FROM analytics.threads t
  WHERE t.snapshot_at = (SELECT max(snapshot_at) FROM analytics.threads)
), latest_comments AS (
  SELECT c.* FROM analytics.comments c
  WHERE c.snapshot_at = (SELECT max(snapshot_at) FROM analytics.comments)
), latest_votes AS (
  SELECT v.* FROM analytics.votes v
  WHERE v.snapshot_at = (SELECT max(snapshot_at) FROM analytics.votes)
), latest_reports AS (
  SELECT r.* FROM analytics.reports r
  WHERE r.snapshot_at = (SELECT max(snapshot_at) FROM analytics.reports)
), society_counts AS (
  SELECT society_id, count(*) AS threads, 0 AS comments, 0 AS votes, 0 AS reports
  FROM latest_threads GROUP BY society_id
  UNION ALL
  SELECT society_id, 0, count(*), 0, 0
  FROM latest_comments GROUP BY society_id
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
WITH latest_societies AS (
  SELECT s.* FROM analytics.societies s
  WHERE s.snapshot_at = (SELECT max(snapshot_at) FROM analytics.societies)
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
   AND m.snapshot_at = (SELECT max(snapshot_at) FROM analytics.memberships)
  LEFT JOIN analytics.threads t
    ON t.society_id = s.id
   AND t.snapshot_at = (SELECT max(snapshot_at) FROM analytics.threads)
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
      ORDER BY member_count DESC, society_id), ',')), ''), ']')),
    json_parse(concat('[', coalesce((SELECT array_join(array_agg(
      json_format(CAST(CAST(ROW(society_id, name, member_count, thread_count) AS ROW(society_id VARCHAR, name VARCHAR, member_count BIGINT, thread_count BIGINT)) AS JSON))
      ORDER BY thread_count DESC, society_id), ',')), ''), ']'))
  ) AS ROW(top_by_members JSON, top_by_threads JSON)) AS JSON)) AS data`,

  moderation: `
WITH latest AS (
  SELECT r.* FROM analytics.reports r
  WHERE r.snapshot_at = (SELECT max(snapshot_at) FROM analytics.reports)
), society_metrics AS (
  SELECT
    society_id,
    count_if(status = 'pending') AS pending_reports,
    count_if(status = 'resolved' AND resolved_at >= current_date) AS resolved_today,
    coalesce(avg(IF(status = 'resolved' AND resolved_at IS NOT NULL,
      date_diff('second', created_at, resolved_at) / 3600.0, NULL)), 0.0) AS avg_resolution_hours,
    count(*) AS total_reports
  FROM latest
  GROUP BY society_id
)
SELECT
  'moderation' AS metric_type,
  CAST(NULL AS varchar) AS society_id,
  ${PERIOD_COLUMNS},
  json_format(CAST(CAST(ROW(
    (SELECT count_if(status = 'pending') FROM latest),
    (SELECT count_if(status = 'resolved' AND resolved_at >= current_date) FROM latest),
    (SELECT coalesce(avg(IF(status = 'resolved' AND resolved_at IS NOT NULL,
      date_diff('second', created_at, resolved_at) / 3600.0, NULL)), 0.0) FROM latest),
    (SELECT count(*) FROM latest)
  ) AS ROW(pending_reports BIGINT, resolved_today BIGINT, avg_resolution_hours DOUBLE, total_reports BIGINT)) AS JSON)) AS data
UNION ALL
SELECT
  'moderation', society_id, ${PERIOD_COLUMNS},
  json_format(CAST(CAST(ROW(pending_reports, resolved_today, avg_resolution_hours, total_reports)
    AS ROW(pending_reports BIGINT, resolved_today BIGINT, avg_resolution_hours DOUBLE, total_reports BIGINT)) AS JSON))
FROM society_metrics`,
};

export const METRIC_SQL_TYPES = Object.freeze([
  "user_growth",
  "content_volume",
  "top_societies",
  "moderation",
] as const);
