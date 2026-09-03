import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { migrateWithLock } from "../../../../test/database";
import { DrizzleDiscussionRepository } from "./drizzle-discussion.repository";

// PostgreSQL integration coverage for the atomic `published -> removed`
// transition guarded by the thread status (ATR-006). These run only when
// DATABASE_URL is provided (set DATABASE_URL and give the role permission to
// run migrations and write the tables).
const connectionString = process.env.DATABASE_URL;
const describeWithDb = connectionString === undefined ? describe.skip : describe;

describeWithDb("removePublishedThreadIfActive conditional transition", () => {
  let pool: Pool;
  let repository: DrizzleDiscussionRepository;
  let societyId: string;
  let authorId: string;

  beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const db = drizzle({ client: pool });
    await migrateWithLock(pool);
    repository = new DrizzleDiscussionRepository(db);
    societyId = randomUUID();
    authorId = randomUUID();
    const avatarMediaId = randomUUID();

    await pool.query(
      "insert into auth_users (id, email) values ($1, $2) on conflict (id) do nothing",
      [authorId, `member-${authorId.slice(0, 8)}@example.com`],
    );
    await pool.query(
      "insert into media_assets (id, owner_id, object_key, purpose, content_type, byte_size, status) values ($1, $2, $3, 'avatar', 'image/png', 1, 'ready')",
      [avatarMediaId, authorId, `avatar-${avatarMediaId}`],
    );
    await pool.query(
      "insert into societies (id, name, slug, description, created_by, avatar_media_id, created_at, updated_at) values ($1, $2, $3, $4, $5, $6, now(), now()) on conflict (id) do nothing",
      [
        societyId,
        `Society ${societyId.slice(0, 8)}`,
        `slug-${societyId.slice(0, 8)}`,
        "Integration testing society",
        authorId,
        avatarMediaId,
      ],
    );
  });

  afterAll(async () => {
    if (pool !== undefined) await pool.end();
  });

  async function insertThread(status: "published" | "removed" | "deleted"): Promise<string> {
    const id = randomUUID();
    await pool.query(
      `insert into threads (id, society_id, author_id, title, body, status, score, comment_count, created_at, updated_at, deleted_at)
       values ($1, $2, $3, $4, NULL, $5, 0, 0, now(), now(), $6)`,
      [
        id,
        societyId,
        authorId,
        `Thread ${status}`,
        status,
        status === "deleted" ? new Date() : null,
      ],
    );
    return id;
  }

  function cleanup(...ids: string[]) {
    return pool.query(
      "delete from threads where id = any($1::uuid[])",
      [ids],
    );
  }

  it("transitions a published thread to removed exactly once", async () => {
    const id = await insertThread("published");
    try {
      const now = new Date();
      const updated = await repository.removePublishedThreadIfActive(id, now);

      expect(updated).not.toBeNull();
      expect(updated!.status).toBe("removed");
      expect(updated!.updatedAt.getTime()).toBe(now.getTime());

      // A second attempt must not transition again and must report inactive.
      const second = await repository.removePublishedThreadIfActive(id, new Date(now.getTime() + 1000));
      expect(second).toBeNull();

      const row = await pool.query("select status from threads where id = $1", [id]);
      expect(row.rows[0].status).toBe("removed");
    } finally {
      await cleanup(id);
    }
  });

  it("does not update an already-removed thread", async () => {
    const id = await insertThread("removed");
    try {
      const updated = await repository.removePublishedThreadIfActive(id, new Date());
      expect(updated).toBeNull();

      const row = await pool.query("select status from threads where id = $1", [id]);
      expect(row.rows[0].status).toBe("removed");
    } finally {
      await cleanup(id);
    }
  });

  it("never updates a deleted thread", async () => {
    const id = await insertThread("deleted");
    try {
      const updated = await repository.removePublishedThreadIfActive(id, new Date());
      expect(updated).toBeNull();

      const row = await pool.query("select status from threads where id = $1", [id]);
      expect(row.rows[0].status).toBe("deleted");
    } finally {
      await cleanup(id);
    }
  });
});
