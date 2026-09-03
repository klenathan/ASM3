import { ACTION_EVENT_TYPES } from "../domain/action-event";
import type { ActionMetricKind } from "../domain/action-metrics";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ActionMetricSqlCatalog = Readonly<Record<ActionMetricKind, string>>;

/** SQL for the event-derived portion of the v2 workflow. */
export function createActionAthenaSqlCatalog(
  snapshotId: string,
  periodStart: string,
  periodEnd: string,
): ActionMetricSqlCatalog {
  const snapshot = literal(snapshotId);
  const start = literalDate(periodStart);
  const end = literalDate(periodEnd);
  const source = `analytics.action_events
WHERE event_date >= CAST(${start} AS date)
  AND event_date < CAST(${end} AS date)
  AND snapshot_id = ${snapshot}`;
  const eventCounts = `json_parse(concat(
    ${ACTION_EVENT_TYPES.map((eventType, index) =>
      `${index === 0 ? "'{" : "',"}"${eventType}":', CAST(count_if(event_type = '${eventType}') AS varchar)`,
    ).join(",\n    ")},
    '}'))`;
  const fields = `
    ${eventCounts},
    count(DISTINCT actor_pseudonym),
    count_if(event_type IN ('thread_reaction_changed', 'comment_reaction_changed') AND to_reaction = 1),
    count_if(event_type IN ('thread_reaction_changed', 'comment_reaction_changed') AND from_reaction = 1 AND to_reaction = 0),
    count_if(event_type IN ('thread_reaction_changed', 'comment_reaction_changed') AND to_reaction = -1),
    count_if(event_type IN ('thread_reaction_changed', 'comment_reaction_changed') AND from_reaction = -1 AND to_reaction = 0),
    coalesce(sum(to_reaction - from_reaction), 0),
    count_if(event_type = 'society_membership_joined'),
    count_if(event_type = 'society_membership_left'),
    count_if(event_type = 'society_membership_activated'),
    count_if(event_type = 'society_membership_banned'),
    count_if(event_type IN ('society_membership_joined', 'society_membership_left', 'society_membership_activated', 'society_membership_banned')),
    min(occurred_at),
    max(occurred_at)`;
  const row = `CAST(CAST(ROW(${fields}) AS ROW(
    event_counts JSON, distinct_actors BIGINT, likes_added BIGINT, likes_removed BIGINT,
    dislikes_added BIGINT, dislikes_removed BIGINT, reaction_score_delta BIGINT,
    joins BIGINT, leaves BIGINT, activations BIGINT, bans BIGINT, active_membership_delta BIGINT,
    first_activity_at timestamp, last_activity_at timestamp)) AS JSON)`;
  const period = `CAST(${start} AS timestamp) AS period_start, CAST(${end} AS timestamp) AS period_end`;
  const currentStateData = `json_format(CAST(CAST(ROW(CAST(${end} AS timestamp), positive_reactions, negative_reactions, positive_reactions - negative_reactions, active_memberships) AS ROW(snapshot_at timestamp, positive_reactions BIGINT, negative_reactions BIGINT, reaction_score BIGINT, active_memberships BIGINT)) AS JSON))`;
  const currentStateRows = `(SELECT
      CAST(NULL AS varchar) AS society_id,
      coalesce(sum(if(v.value = 1, v.vote_count, 0)), 0) positive_reactions,
      coalesce(sum(if(v.value = -1, v.vote_count, 0)), 0) negative_reactions,
      m.active_memberships
    FROM analytics.votes v
    CROSS JOIN (SELECT coalesce(sum(member_count), 0) active_memberships
      FROM analytics.memberships WHERE status = 'active' AND snapshot_id = ${snapshot}) m
    WHERE v.snapshot_id = ${snapshot}
    GROUP BY m.active_memberships
    UNION ALL
    SELECT v.society_id, coalesce(sum(if(v.value = 1, v.vote_count, 0)), 0),
      coalesce(sum(if(v.value = -1, v.vote_count, 0)), 0),
      coalesce(sum(m.member_count), 0)
    FROM analytics.votes v LEFT JOIN analytics.memberships m ON m.society_id = v.society_id
      AND m.status = 'active' AND m.snapshot_id = ${snapshot}
    WHERE v.snapshot_id = ${snapshot}
    GROUP BY v.society_id)`;
  const currentStateSql = `SELECT 'current_state' metric_kind,
      CASE WHEN society_id IS NULL THEN 'platform' ELSE 'society' END grain,
      society_id, CAST(NULL AS varchar) target_type, CAST(NULL AS varchar) target_id,
      CAST(NULL AS varchar) thread_id, ${period}, CAST(${end} AS timestamp) snapshot_at,
      ${currentStateData} data FROM ${currentStateRows}`;
  return {
    activity: `SELECT 'activity' metric_kind, 'platform' grain, CAST(NULL AS varchar) society_id,
      CAST(NULL AS varchar) target_type, CAST(NULL AS varchar) target_id, CAST(NULL AS varchar) thread_id,
      ${period}, CAST(NULL AS timestamp) snapshot_at, json_format(${row}) data FROM ${source}`,
    current_state: currentStateSql,
    reconciliation: `SELECT 'reconciliation' metric_kind, 'platform' grain, CAST(NULL AS varchar) society_id,
      CAST(NULL AS varchar) target_type, CAST(NULL AS varchar) target_id, CAST(NULL AS varchar) thread_id,
      ${period}, CAST(${end} AS timestamp) snapshot_at,
      json_format(CAST(CAST(ROW('not_comparable', CAST(NULL AS timestamp), CAST(${end} AS timestamp), 0, 0, 0) AS ROW(status varchar, previous_snapshot_at timestamp, current_snapshot_at timestamp, expected BIGINT, actual BIGINT, difference BIGINT)) AS JSON)) data
      FROM analytics.action_events WHERE 1 = 0`,
  };
}

function literal(value: string): string {
  if (!UUID_PATTERN.test(value)) throw new Error("analytics snapshot id must be a UUID");
  return `'${value}'`;
}

function literalDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("analytics period must be an ISO date");
  return `'${value}'`;
}
