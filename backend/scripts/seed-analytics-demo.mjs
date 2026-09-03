#!/usr/bin/env node
/**
 * Seeds deterministic, realistic source data for the Glue + Athena dashboard demo.
 * This intentionally writes the PostgreSQL product source tables.
 * The normal refresh workflow snapshots them through Glue and computes
 * action metrics in Athena, so the demo exercises the real analytics path.
 *
 * Prerequisite: run `pnpm db:migrate` and `pnpm db:seed` first.
 * Usage: pnpm analytics:demo [--refresh]
 */
import { createHash } from "node:crypto";
import { config as loadDotenv } from "dotenv";
import pg from "pg";

const { Pool } = pg;
const NAMESPACE = "rmit-analytics-demo-v1";
const DEFAULT_THREAD_COUNT = 10;
const DEFAULT_COMMENT_COUNT = 3;
const DEFAULT_REPORT_COUNT = 3;
const DAYS_OF_HISTORY = 90;

loadDotenv({ quiet: true });

const options = parseOptions(process.argv.slice(2));
if (options.refresh && !process.env.ANALYTICS_SCHEDULER_SECRET) {
  throw new Error(
    "--refresh requires ANALYTICS_SCHEDULER_SECRET; alternatively trigger refresh from Admin Center",
  );
}
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required; load the repository .env first");
}

const pool = new Pool({
  connectionString: databaseUrl,
  max: 1,
  ...(process.env.DATABASE_SSL === "true"
    ? { ssl: { rejectUnauthorized: true } }
    : {}),
});

try {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const societies = await getSocieties(client);
    if (societies.length < 5) {
      throw new Error(
        `expected at least 5 active societies, found ${societies.length}; run pnpm db:seed first`,
      );
    }

    const userCount = options.users ?? 40;
    if (!Number.isInteger(userCount) || userCount < 12 || userCount > 200) {
      throw new Error("--users must be an integer from 12 to 200");
    }

    const now = new Date();
    const users = createUsers(userCount, now);
    await insertUsers(client, users);
    await insertMemberships(client, societies, users, now);
    const threads = createThreads(societies, users, now);
    await insertThreads(client, threads);
    const comments = createComments(threads, users);
    await insertComments(client, comments);
    await insertVotes(client, threads, comments, users, now);
    const reports = createReports(societies, threads, users, now);
    await insertReports(client, reports);
    await refreshDiscussionRollups(client, threads, comments);
    await client.query("COMMIT");

    process.stdout.write(
      `[analytics-demo] seeded ${users.length} users, ${threads.length} threads, ` +
        `${comments.length} comments, ${reports.length} reports across ${societies.length} societies\n`,
    );
    process.stdout.write(
      "[analytics-demo] source data is ready; trigger the real Glue/Athena refresh " +
        "from Admin Center or rerun with --refresh\n",
    );

    if (options.refresh) {
      await requestRefresh();
    }
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}

function parseOptions(args) {
  const result = { refresh: false, users: undefined };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") continue;
    if (arg === "--refresh") {
      result.refresh = true;
      continue;
    }
    if (arg === "--users") {
      const value = args[index + 1];
      if (value === undefined) throw new Error("--users requires a value");
      result.users = Number(value);
      index += 1;
      continue;
    }
    throw new Error(`unknown option: ${arg}`);
  }
  return result;
}

async function getSocieties(client) {
  const { rows } = await client.query(
    `SELECT id, name, slug
       FROM societies
      WHERE status = 'active'
      ORDER BY slug
      LIMIT 10`,
  );
  return rows;
}

function stableUuid(key) {
  const digest = createHash("sha256").update(`${NAMESPACE}:${key}`).digest();
  const bytes = Buffer.from(digest.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function daysAgo(now, days, hours = 0) {
  return new Date(now.getTime() - ((days * 24 + hours) * 60 * 60 * 1000));
}

function createUsers(count, now) {
  return Array.from({ length: count }, (_, index) => {
    const suspended = index % 13 === 0;
    const id = stableUuid(`user:${index}`);
    return {
      id,
      email: `analytics.demo.${String(index + 1).padStart(3, "0")}@rmit.edu.au`,
      displayName: `Analytics Demo ${String(index + 1).padStart(2, "0")}`,
      status: suspended ? "suspended" : "active",
      createdAt: daysAgo(now, (index * 11) % DAYS_OF_HISTORY, index % 8),
      suspendedUntil: suspended ? new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) : null,
    };
  });
}

async function insertUsers(client, users) {
  await insertRows(
    client,
    "auth_users",
    ["id", "email", "password_hash", "created_at"],
    users.map((user) => [user.id, user.email, "", user.createdAt]),
    "id",
    ["email", "created_at"],
  );
  await insertRows(
    client,
    "user_profiles",
    ["user_id", "display_name", "bio", "platform_role", "status", "suspended_until", "created_at", "updated_at"],
    users.map((user) => [
      user.id,
      user.displayName,
      "Synthetic activity for the RMIT analytics demonstration.",
      "student",
      user.status,
      user.suspendedUntil,
      user.createdAt,
      user.createdAt,
    ]),
    "user_id",
    ["display_name", "bio", "platform_role", "status", "suspended_until", "created_at", "updated_at"],
  );
}

async function insertMemberships(client, societies, users, now) {
  const rows = [];
  for (let societyIndex = 0; societyIndex < societies.length; societyIndex += 1) {
    const weight = Math.max(3, 10 - societyIndex);
    for (let userIndex = 0; userIndex < users.length; userIndex += 1) {
      if ((userIndex * 7 + societyIndex * 3) % 10 >= weight) continue;
      rows.push([
        societies[societyIndex].id,
        users[userIndex].id,
        (userIndex + societyIndex) % 19 === 0 ? "moderator" : "member",
        "active",
        daysAgo(now, (userIndex * 5 + societyIndex) % DAYS_OF_HISTORY),
        now,
      ]);
    }
  }
  await insertRows(
    client,
    "society_memberships",
    ["society_id", "user_id", "role", "status", "joined_at", "updated_at"],
    rows,
    ["society_id", "user_id"].join(","),
    ["role", "status", "joined_at", "updated_at"],
  );
}

function createThreads(societies, users, now) {
  const rows = [];
  for (let societyIndex = 0; societyIndex < societies.length; societyIndex += 1) {
    for (let threadIndex = 0; threadIndex < DEFAULT_THREAD_COUNT; threadIndex += 1) {
      const sequence = societyIndex * DEFAULT_THREAD_COUNT + threadIndex;
      rows.push({
        id: stableUuid(`thread:${societyIndex}:${threadIndex}`),
        societyId: societies[societyIndex].id,
        authorId: users[(sequence * 3 + societyIndex) % users.length].id,
        title: [
          "What is everyone working on this week?",
          "Tips that made semester easier",
          "Looking for recommendations from the community",
          "Share your experience with this RMIT service",
          "Study group and event discussion",
        ][sequence % 5],
        body: `A synthetic discussion for ${societies[societyIndex].name}. ` +
          "It gives the analytics demo a realistic mix of activity to explore.",
        status: "published",
        createdAt: daysAgo(now, 1 + ((sequence * 7) % (DAYS_OF_HISTORY - 1)), sequence % 12),
      });
    }
  }
  return rows;
}

async function insertThreads(client, threads) {
  await insertRows(
    client,
    "threads",
    ["id", "society_id", "author_id", "title", "body", "status", "created_at", "updated_at"],
    threads.map((thread) => [
      thread.id,
      thread.societyId,
      thread.authorId,
      thread.title,
      thread.body,
      thread.status,
      thread.createdAt,
      thread.createdAt,
    ]),
    "id",
    ["society_id", "author_id", "title", "body", "status", "created_at", "updated_at"],
  );
}

function createComments(threads, users) {
  return threads.flatMap((thread, threadIndex) =>
    Array.from({ length: DEFAULT_COMMENT_COUNT }, (_, commentIndex) => ({
      id: stableUuid(`comment:${threadIndex}:${commentIndex}`),
      threadId: thread.id,
      authorId: users[(threadIndex + commentIndex * 5 + 2) % users.length].id,
      body: [
        "This is a useful perspective; thanks for sharing.",
        "I had a similar experience and found the same workaround.",
        "Adding this to my list for the next study week.",
      ][commentIndex],
      createdAt: new Date(thread.createdAt.getTime() + (commentIndex + 1) * 60 * 60 * 1000),
    })),
  );
}

async function insertComments(client, comments) {
  await insertRows(
    client,
    "comments",
    ["id", "thread_id", "author_id", "body", "status", "created_at", "updated_at"],
    comments.map((comment) => [
      comment.id,
      comment.threadId,
      comment.authorId,
      comment.body,
      "published",
      comment.createdAt,
      comment.createdAt,
    ]),
    "id",
    ["thread_id", "author_id", "body", "status", "created_at", "updated_at"],
  );
}

async function insertVotes(client, threads, comments, users, now) {
  const threadVotes = [];
  for (let threadIndex = 0; threadIndex < threads.length; threadIndex += 1) {
    for (let offset = 0; offset < 5; offset += 1) {
      threadVotes.push([
        threads[threadIndex].id,
        users[(threadIndex * 2 + offset + 1) % users.length].id,
        offset === 4 && threadIndex % 6 === 0 ? -1 : 1,
        daysAgo(now, (threadIndex + offset) % DAYS_OF_HISTORY),
        now,
      ]);
    }
  }
  await insertRows(
    client,
    "thread_votes",
    ["thread_id", "user_id", "value", "created_at", "updated_at"],
    threadVotes,
    ["thread_id", "user_id"].join(","),
    ["value", "created_at", "updated_at"],
  );

  const commentVotes = [];
  for (let commentIndex = 0; commentIndex < comments.length; commentIndex += 1) {
    for (let offset = 0; offset < 2; offset += 1) {
      commentVotes.push([
        comments[commentIndex].id,
        users[(commentIndex + offset + 9) % users.length].id,
        commentIndex % 11 === 0 && offset === 1 ? -1 : 1,
        daysAgo(now, (commentIndex + offset) % DAYS_OF_HISTORY),
        now,
      ]);
    }
  }
  await insertRows(
    client,
    "comment_votes",
    ["comment_id", "user_id", "value", "created_at", "updated_at"],
    commentVotes,
    ["comment_id", "user_id"].join(","),
    ["value", "created_at", "updated_at"],
  );
}

function createReports(societies, threads, users, now) {
  return societies.flatMap((society, societyIndex) =>
    Array.from({ length: DEFAULT_REPORT_COUNT }, (_, reportIndex) => {
      const sequence = societyIndex * DEFAULT_REPORT_COUNT + reportIndex;
      const pending = reportIndex === 0;
      return {
        id: stableUuid(`report:${societyIndex}:${reportIndex}`),
        societyId: society.id,
        reporterId: users[(sequence + 4) % users.length].id,
        threadId: threads[(societyIndex * DEFAULT_THREAD_COUNT + reportIndex) % threads.length].id,
        status: pending ? "pending" : "resolved",
        resolution: pending ? null : "suspend_user",
        resolutionNote: pending ? null : "Synthetic report resolved for dashboard demonstration.",
        createdAt: pending ? daysAgo(now, reportIndex + 1) : daysAgo(now, 2 + reportIndex),
        resolvedAt: pending ? null : reportIndex === 1 ? new Date(now) : daysAgo(now, 1),
        updatedAt: new Date(now),
        resolvedBy: pending ? null : users[0].id,
      };
    }),
  );
}

async function insertReports(client, reports) {
  await insertRows(
    client,
    "reports",
    ["id", "society_id", "reporter_id", "thread_id", "reason", "details", "status", "resolution", "resolution_note", "created_at", "updated_at", "resolved_at", "resolved_by"],
    reports.map((report) => [
      report.id,
      report.societyId,
      report.reporterId,
      report.threadId,
      "off_topic",
      "Synthetic report for the analytics dashboard demonstration.",
      report.status,
      report.resolution,
      report.resolutionNote,
      report.createdAt,
      report.updatedAt,
      report.resolvedAt,
      report.resolvedBy,
    ]),
    "id",
    ["society_id", "reporter_id", "thread_id", "status", "resolution", "resolution_note", "created_at", "updated_at", "resolved_at", "resolved_by"],
  );
}

async function refreshDiscussionRollups(client, threads, comments) {
  const commentCounts = new Map();
  for (const comment of comments) {
    commentCounts.set(comment.threadId, (commentCounts.get(comment.threadId) ?? 0) + 1);
  }
  for (const thread of threads) {
    await client.query(
      `UPDATE threads
          SET comment_count = $2,
              score = (
                SELECT COALESCE(SUM(value), 0)
                  FROM thread_votes
                 WHERE thread_id = $1
              )
        WHERE id = $1`,
      [thread.id, commentCounts.get(thread.id) ?? 0],
    );
  }
}

async function insertRows(client, table, columns, rows, conflictTarget, updateColumns) {
  if (rows.length === 0) return;
  const values = [];
  const placeholders = rows.map((row) => {
    const rowPlaceholders = row.map((value) => {
      values.push(value);
      return `$${values.length}`;
    });
    return `(${rowPlaceholders.join(", ")})`;
  });
  const updates = updateColumns
    .map((column) => `${column} = EXCLUDED.${column}`)
    .join(", ");
  await client.query(
    `INSERT INTO ${table} (${columns.join(", ")})
     VALUES ${placeholders.join(", ")}
     ON CONFLICT (${conflictTarget}) DO UPDATE SET ${updates}`,
    values,
  );
}

async function requestRefresh() {
  const apiUrl = process.env.ANALYTICS_API_URL ?? "http://localhost:3000";
  const secret = process.env.ANALYTICS_SCHEDULER_SECRET;
  if (!secret) {
    throw new Error(
      "--refresh requires ANALYTICS_SCHEDULER_SECRET; alternatively trigger refresh from Admin Center",
    );
  }
  const response = await fetch(`${apiUrl.replace(/\/$/, "")}/api/v2/admin/analytics/scheduled-refresh`, {
    method: "POST",
    headers: { "x-analytics-scheduler-secret": secret },
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`analytics refresh request failed (${response.status}): ${body}`);
  }
  process.stdout.write(`[analytics-demo] refresh accepted: ${body}\n`);
}
