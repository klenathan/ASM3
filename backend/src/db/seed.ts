/**
 * Idempotent database seeder.
 *
 * Seeds a deterministic system-admin user plus a set of college-student-life
 * societies (Reddit-style communities) with a few rules each.
 *
 * Safe to run repeatedly: every insert uses onConflictDoNothing, so rows that
 * are already present are skipped ("ignore if already present").
 *
 * Usage:
 *   pnpm db:seed
 */
import { randomUUID } from "node:crypto";

import { config as loadDotenv } from "dotenv";
import { eq, sql } from "drizzle-orm";

import { loadConfig } from "../config/env";
import { createLogger } from "../lib/logger";
import { createDatabase } from "./client";
import { normalizeRuleDescription, normalizeRuleTitle } from "../modules/societies/domain/society";
import { societies, societyRules } from "../modules/societies/infrastructure/society.tables";
import { mediaAssets } from "../modules/media/infrastructure/media.tables";
import { authUsers } from "../modules/identity/infrastructure/auth.tables";
import { userProfiles } from "../modules/identity/infrastructure/user-profile.tables";

/** Deterministic seed owner. Created idempotently and reused as society creator. */
const SEED_OWNER = Object.freeze({
  id: "11111111-1111-4111-8111-111111111111",
  email: "seed.admin@rmit.edu.au",
});

const SEED_OWNER_PROFILE = Object.freeze({
  userId: SEED_OWNER.id,
  displayName: "Seed Admin",
  bio: "Auto-created by db:seed to own seeded societies.",
  platformRole: "system_admin" as const,
  status: "active" as const,
});

interface SeedRule {
  readonly title: string;
  readonly description: string;
}

interface SeedSociety {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly rules: readonly SeedRule[];
}

const SEED_SOCIETIES: readonly SeedSociety[] = [
  {
    slug: "rmit",
    name: "RMIT Community",
    description:
      "The general hub for everything RMIT — news, announcements, memes, and water-cooler chat across all campuses.",
    rules: [
      { title: "Be respectful", description: "Treat classmates like people in the corridor. No harassment or hate." },
      { title: "Stay on topic", description: "General RMIT chatter lives here. Dedicated topics go to their own societies." },
    ],
  },
  {
    slug: "rmit-ask",
    name: "Ask RMIT",
    description:
      "Got a question about courses, enrollment, fees, or where Building 80 actually is? Ask away — someone's been through it.",
    rules: [
      { title: "Search first", description: "Check the sticky FAQ and search before posting common questions." },
      { title: "No homework answers", description: "Explain concepts, don't do people's assignments for them." },
    ],
  },
  {
    slug: "rmit-academics",
    name: "RMIT Academics",
    description:
      "Assignments, exams, study strategies, and lecturer tips. The quiet study-room of RMIT Society.",
    rules: [
      { title: "No academic misconduct", description: "No sharing solutions or encouraging plagiarism or contract cheating." },
      { title: "Mark solutions as spoilers", description: "Hide working answers so others can attempt first." },
    ],
  },
  {
    slug: "rmit-campus-life",
    name: "Campus Life",
    description:
      "Events, clubs, societies day, and the best cheap lunch spots on and off campus. What's happening this week?",
    rules: [
      { title: "Promote, don't spam", description: "Club promos welcome. Repeat posting is not." },
      { title: "Keep it inclusive", description: "All campuses, all backgrounds, everyone invited." },
    ],
  },
  {
    slug: "rmit-housing",
    name: "RMIT Housing",
    description:
      "Off-campus housing, roommate matching, lease advice, and landlord red-flag horror stories.",
    rules: [
      { title: "No scams", description: "Never ask for deposits outside official channels or post bank details." },
      { title: "Flag listings", description: "Report suspicious listings so the community can verify them." },
    ],
  },
  {
    slug: "rmit-careers",
    name: "RMIT Careers",
    description:
      "Internships, graduate programs, CV reviews, and interview experiences. Your career, one WAM-saving post at a time.",
    rules: [
      { title: "Credibility over hype", description: "Share real experiences and check that job posts are legitimate." },
      { title: "No referral farming", description: "Offer value first; recruiters must follow site rules." },
    ],
  },
  {
    slug: "rmit-tech",
    name: "RMIT Tech",
    description:
      "CS, software, IT, and engineering — side projects, tech meetups, and debugging support.",
    rules: [
      { title: "Help, don't hand over", description: "Guide toward the fix and explain the why." },
      { title: "Keep it constructive", description: "No language or framework flame wars." },
    ],
  },
  {
    slug: "rmit-wellbeing",
    name: "RMIT Wellbeing",
    description:
      "Mental health, burnout, and study-life balance. A judgment-free space to talk it out.",
    rules: [
      { title: "Be kind", description: "Supportive tone only. This is a safe space." },
      { title: "No medical advice", description: "Share resources and experiences; direct crises to professional help." },
    ],
  },
  {
    slug: "rmit-fitness",
    name: "RMIT Fitness",
    description:
      "Gym buddies, sports, intramurals, and training tips. Lifting grades and weights since day one.",
    rules: [
      { title: "No supplements spam", description: "No MLM or supplement pitches." },
      { title: "Beginner friendly", description: "Everyone starts somewhere — no gatekeeping." },
    ],
  },
  {
    slug: "rmit-international",
    name: "RMIT International",
    description:
      "For exchange, study-abroad, and international students — visa stress, culture shock, and finding your people.",
    rules: [
      { title: "No visa-advice bypass", description: "Encourage checking official immigration sources." },
      { title: "Welcome newcomers", description: "Be the reason someone feels at home." },
    ],
  },
];

/**
 * Creates a deterministic, ready avatar asset for a seeded society and returns
 * its id. The media object itself is a lightweight placeholder in S3; the
 * metadata row is what societies reference via avatar_media_id.
 */
async function seedAvatar(
  database: ReturnType<typeof createDatabase>,
  slug: string,
): Promise<string> {
  const objectKey = `media/avatar/seed-${slug}`;
  const existing = await database.db
    .select({ id: mediaAssets.id })
    .from(mediaAssets)
    .where(eq(mediaAssets.objectKey, objectKey))
    .limit(1);
  if (existing[0] !== undefined) {
    return existing[0].id;
  }

  const now = new Date();
  const [row] = await database.db
    .insert(mediaAssets)
    .values({
      id: randomUUID(),
      ownerId: SEED_OWNER.id,
      objectKey,
      purpose: "avatar",
      contentType: "image/png",
      byteSize: 1,
      checksum: null,
      status: "ready",
      createdAt: now,
      completedAt: now,
    })
    .returning({ id: mediaAssets.id });
  if (row === undefined) {
    throw new Error(`Seed avatar for "${slug}" could not be created`);
  }

  return row.id;
}

async function main(): Promise<void> {
  loadDotenv({ quiet: true });
  const config = loadConfig();
  const logger = createLogger(config);
  const database = createDatabase(config, logger);

  try {
    await database.checkConnection();

    // 1. Seed owner user (idempotent).
    await database.db
      .insert(authUsers)
      .values({
        id: SEED_OWNER.id,
        email: SEED_OWNER.email,
        passwordHash: "seed-password-disabled",
      })
      .onConflictDoNothing();

    await database.db
      .insert(userProfiles)
      .values({
        ...SEED_OWNER_PROFILE,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoNothing();

    // 2. Seed societies and, per society, its rules (both idempotent).
    const now = new Date();
    for (const seed of SEED_SOCIETIES) {
      const avatarMediaId = await seedAvatar(database, seed.slug);
      await database.db
        .insert(societies)
        .values({
          id: randomUUID(),
          slug: seed.slug,
          name: seed.name,
          description: seed.description,
          avatarMediaId,
          createdBy: SEED_OWNER.id,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing();

      // Repair pre-existing rows that predate the required avatar column.
      await database.db
        .update(societies)
        .set({ avatarMediaId })
        .where(sql`${societies.slug} = ${seed.slug} and ${societies.avatarMediaId} is null`);

      const [existing] = await database.db
        .select({ id: societies.id })
        .from(societies)
        .where(sql`${societies.slug} = ${seed.slug}`)
        .limit(1);

      if (existing === undefined) {
        throw new Error(`Seeded society "${seed.slug}" not found after insert`);
      }

      const insertedRules = await Promise.all(
        seed.rules.map((rule, index) =>
          database.db
            .insert(societyRules)
            .values({
              id: randomUUID(),
              societyId: existing.id,
              position: index + 1,
              title: normalizeRuleTitle(rule.title),
              description: normalizeRuleDescription(rule.description),
              createdAt: now,
              updatedAt: now,
            })
            .onConflictDoNothing(),
        ),
      );

      const ruleCount = insertedRules.reduce(
        (sum, result) => sum + (result.rowCount ?? 0),
        0,
      );
      console.log(
        `[seed] society "${seed.slug}": ${ruleCount} rule(s) inserted (0 means already present)`,
      );
    }

    console.log(`[seed] done: ${SEED_SOCIETIES.length} societies ensured.`);
  } finally {
    await database.close();
  }
}

main().catch((error) => {
  console.error("[seed] failed:", error);
  process.exitCode = 1;
});
