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
  const fields = `
    json_parse('{}'),
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
  const row = `CAST(ROW(${fields}) AS ROW(
    event_counts JSON, distinct_actors BIGINT, likes_added BIGINT, likes_removed BIGINT,
    dislikes_added BIGINT, dislikes_removed BIGINT, reaction_score_delta BIGINT,
    joins BIGINT, leaves BIGINT, activations BIGINT, bans BIGINT, active_membership_delta BIGINT,
    first_activity_at timestamp, last_activity_at timestamp))`;
  const period = `CAST(${start} AS timestamp), CAST(${end} AS timestamp)`;
  return {
    activity: `SELECT 'activity' metric_kind, 'platform' grain, CAST(NULL AS varchar) society_id,
      CAST(NULL AS varchar) target_type, CAST(NULL AS varchar) target_id, CAST(NULL AS varchar) thread_id,
      ${period}, CAST(NULL AS timestamp) snapshot_at, json_format(${row}) data FROM ${source}`,
    current_state: `SELECT 'current_state' metric_kind, 'platform' grain, CAST(NULL AS varchar) society_id,
      CAST(NULL AS varchar) target_type, CAST(NULL AS varchar) target_id, CAST(NULL AS varchar) thread_id,
      ${period}, CAST(${end} AS timestamp) snapshot_at,
      json_format(CAST(ROW(CAST(${end} AS timestamp), 0, 0, 0, CAST(NULL AS BIGINT)) AS ROW(snapshot_at timestamp, positive_reactions BIGINT, negative_reactions BIGINT, reaction_score BIGINT, active_memberships BIGINT))) data
      FROM analytics.action_events WHERE 1 = 0`,
    reconciliation: `SELECT 'reconciliation' metric_kind, 'platform' grain, CAST(NULL AS varchar) society_id,
      CAST(NULL AS varchar) target_type, CAST(NULL AS varchar) target_id, CAST(NULL AS varchar) thread_id,
      ${period}, CAST(${end} AS timestamp) snapshot_at,
      json_format(CAST(ROW('not_comparable', CAST(NULL AS timestamp), CAST(${end} AS timestamp), 0, 0, 0) AS ROW(status varchar, previous_snapshot_at timestamp, current_snapshot_at timestamp, expected BIGINT, actual BIGINT, difference BIGINT))) data
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
