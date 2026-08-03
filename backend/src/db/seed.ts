/**
 * Idempotent database seeder.
 *
 * Seeds deterministic demo data:
 *   - a system-admin owner plus college-student users (login-capable)
 *   - societies (Reddit-style communities) with rules
 *   - society memberships (member / moderator roles)
 *   - threads (some with attached picsum images) and nested comments
 *   - random-but-deterministic upvotes on threads and comments
 *
 * Avatars and thread images resolve through the public picsum.photos API. The
 * remote URL is stored in media_assets.object_key and served back by
 * RemoteMediaStorage via `GET /media/:id/url`. No real S3 upload is required.
 *
 * Safe to run repeatedly: every insert uses onConflictDoNothing with
 * deterministic UUIDs and values, so existing rows are skipped.
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
import { societies, societyMemberships, societyRules } from "../modules/societies/infrastructure/society.tables";
import { mediaAssets } from "../modules/media/infrastructure/media.tables";
import { authUsers } from "../modules/identity/infrastructure/auth.tables";
import { userProfiles } from "../modules/identity/infrastructure/user-profile.tables";
import {
  comments,
  commentVotes,
  threadMedia,
  threads,
  threadVotes,
} from "../modules/discussions/infrastructure/discussion.tables";
import {
  DrizzlePasswordCredentialStore,
  LocalPasswordAdapter,
} from "../modules/identity/infrastructure/local-password.adapter";

/** Shared dev login password for every seeded student. */
const SEED_PASSWORD = "SeedPass123!";

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

// ---------------------------------------------------------------------------
// Deterministic randomness + id helpers (same input => same output each run)
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic v4-style UUID derived from a seed integer. */
function uuidFrom(seed: number): string {
  const rand = mulberry32(seed);
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(rand() * 256);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function picsum(seedKey: string, width: number, height: number): string {
  return `https://picsum.photos/seed/${encodeURIComponent(seedKey)}/${width}/${height}`;
}
const userAvatarUrl = (seedKey: string): string => picsum(seedKey, 400, 400);
const threadImageUrl = (seedKey: string): string => picsum(seedKey, 800, 600);

// ---------------------------------------------------------------------------
// Seed data definitions
// ---------------------------------------------------------------------------

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

interface SeedUser {
  readonly email: string;
  readonly displayName: string;
  readonly bio: string;
  readonly imageSeed: string;
}

const SEED_USERS: readonly SeedUser[] = [
  { email: "anh.nguyen@rmit.edu.au", displayName: "Anh Nguyen", bio: "Software engineering student. Coffee > sleep.", imageSeed: "u-anh" },
  { email: "mia.chen@rmit.edu.au", displayName: "Mia Chen", bio: "Design @ RMIT. Always at acceptable risk of losing my sketchbook.", imageSeed: "u-mia" },
  { email: "dev.patel@rmit.edu.au", displayName: "Dev Patel", bio: "Final year, cloud computing. Ask me about CI/CD.", imageSeed: "u-dev" },
  { email: "sofia.torres@rmit.edu.vn", displayName: "Sofia Torres", bio: "Exchange student from Spain living in Saigon South.", imageSeed: "u-sofia" },
  { email: "liam.okane@rmit.edu.au", displayName: "Liam O'Kane", bio: "Comp sci, gym rat, mediocre guitarist.", imageSeed: "u-liam" },
  { email: "yuki.tanaka@rmit.edu.au", displayName: "Yuki Tanaka", bio: "International student. Ask me about the best ramen near campus.", imageSeed: "u-yuki" },
  { email: "zara.hussain@rmit.edu.au", displayName: "Zara Hussain", bio: "Aspiring PM. Organiser of everything, somehow nothing.", imageSeed: "u-zara" },
  { email: "noah.williams@rmit.edu.au", displayName: "Noah Williams", bio: "Full-stack tinkerer. Side projects > lectures (sorry).", imageSeed: "u-noah" },
];

/** Society slug -> list of user indices that join, and which one moderates. */
const SEED_MEMBERSHIPS: Readonly<Record<string, { members: readonly number[]; moderator: number }>> = {
  rmit: { members: [0, 1, 2, 3, 5, 6], moderator: 0 },
  "rmit-ask": { members: [1, 2, 4, 6], moderator: 1 },
  "rmit-academics": { members: [0, 2, 3, 7], moderator: 2 },
  "rmit-campus-life": { members: [1, 4, 5, 6], moderator: 4 },
  "rmit-housing": { members: [3, 5, 6], moderator: 5 },
  "rmit-careers": { members: [2, 3, 6, 7], moderator: 6 },
  "rmit-tech": { members: [0, 2, 4, 7], moderator: 7 },
  "rmit-wellbeing": { members: [1, 3, 5], moderator: 3 },
  "rmit-fitness": { members: [0, 4, 5], moderator: 4 },
  "rmit-international": { members: [3, 5, 6], moderator: 3 },
};

interface SeedThread {
  readonly title: string;
  readonly body: string;
  readonly authorIndex: number;
  /** true => attach a picsum image; false => text-only thread */
  readonly hasImage: boolean;
  readonly daysAgo: number;
}

const THREAD_COMMENT_POOL: readonly string[] = [
  "Honestly this is such a mood.",
  "Happened to me last semester too, you're not alone.",
  "Great thread, thanks for sharing the details.",
  "I'd second that — same experience on my end.",
  "Wait, really? Where did you find that out?",
  "Bookmarking this for later, super useful.",
  "Can we pin this? So many people ask this every week.",
  "Lol, classic RMIT.",
  "I had the opposite experience but appreciate the perspective.",
];

const THREADS_BY_SOCIETY: Readonly<Record<string, readonly SeedThread[]>> = {
  rmit: [
    { title: "Welcome to the start of the semester — what's everyone studying?", body: "Kicking off a new thread for intros. Drop your degree, campus, and one thing you're excited about this semester.", authorIndex: 0, hasImage: false, daysAgo: 21 },
    { title: "Melbourne vs Saigon campus — how do the vibes compare?", body: "I've only ever been on the Melbourne campus. Curious how Saigon South compares for classes, community, and general student life.", authorIndex: 5, hasImage: true, daysAgo: 14 },
    { title: "Best study spots during peak exam season?", body: "Library gets packed after week 10. Where do you actually get work done on campus?", authorIndex: 3, hasImage: false, daysAgo: 6 },
  ],
  "rmit-ask": [
    { title: "How does the WAM calculation actually work?", body: "Grad programs keep asking about WAM. I've heard three different formulas, which one is right?", authorIndex: 2, hasImage: false, daysAgo: 18 },
    { title: "Can you change campuses mid-degree?", body: "Thinking about moving from Melbourne to Saigon for a semester. Anyone done a campus transfer before?", authorIndex: 3, hasImage: true, daysAgo: 9 },
    { title: "Where is the student services desk in Building 80?", body: "Keep getting lost. Is it floor 2 or 3?", authorIndex: 1, hasImage: false, daysAgo: 3 },
  ],
  "rmit-academics": [
    { title: "Struggling with group assignments? You're not alone", body: "Rant + advice thread. Learned to set a shared doc and clear deadlines in week 1 — it saved my sanity.", authorIndex: 4, hasImage: false, daysAgo: 12 },
    { title: "How to prep for final exams without burning out", body: "Came up with a schedule that actually worked — here's the breakdown.", authorIndex: 0, hasImage: true, daysAgo: 20 },
    { title: "WAM-boosting electives that are actually fun?", body: "Looking for electives that are useful but won't destroy my GPA.", authorIndex: 7, hasImage: false, daysAgo: 5 },
  ],
  "rmit-campus-life": [
    { title: "Clubs and societies day is coming up — what should I join?", body: "There's so many stalls. What are the hidden-gem clubs worth signing up for?", authorIndex: 6, hasImage: false, daysAgo: 15 },
    { title: "Cheap lunch spots near campus", body: "Sharing my list of affordable eats within walking distance. Feel free to add yours.", authorIndex: 1, hasImage: true, daysAgo: 8 },
    { title: "Anyone keen on a casual soccer pick-up game?", body: "Weekend afternoons on the oval if there's enough interest.", authorIndex: 4, hasImage: false, daysAgo: 2 },
  ],
  "rmit-housing": [
    { title: "Roommate hunting — red flags to look out for", body: "After one bad experience, here's what to check before signing anything.", authorIndex: 5, hasImage: false, daysAgo: 11 },
    { title: "Is living in Saigon South worth it for campus access?", body: "Weighing commute time vs cost. Would love real experiences.", authorIndex: 3, hasImage: true, daysAgo: 4 },
  ],
  "rmit-careers": [
    { title: "Internship applications — what made yours stand out?", body: "I keep getting to the final round but no offer. What actually moves the needle?", authorIndex: 2, hasImage: false, daysAgo: 16 },
    { title: "CV review thread — drop yours and we'll give feedback", body: "Post an anonymised CV and the community will critique it constructively.", authorIndex: 6, hasImage: true, daysAgo: 7 },
    { title: "Grad program timeline: when to start applying?", body: "Feeling behind. When did people actually start their grad applications?", authorIndex: 0, hasImage: false, daysAgo: 1 },
  ],
  "rmit-tech": [
    { title: "Side project showcase — show us what you built", body: "Post your WIP or finished project. Let's hype each other up and swap feedback.", authorIndex: 7, hasImage: false, daysAgo: 13 },
    { title: "How are you experimenting with AI tools in your coursework?", body: "Curious how everyone balances using LLMs without crossing the academic-misconduct line.", authorIndex: 2, hasImage: true, daysAgo: 10 },
    { title: "Debugging a flaky test in CI — help a dev out", body: "Intermittent failures only on the build server. What's your go-to strategy?", authorIndex: 4, hasImage: false, daysAgo: 3 },
  ],
  "rmit-wellbeing": [
    { title: "Managing burnout during high workload weeks", body: "Some things that have been helping me lately — sharing in case they help someone else.", authorIndex: 3, hasImage: false, daysAgo: 19 },
    { title: "Looking for study buddies for accountability", body: "We hold each other to weekly goals on video calls. Quiet group, zero pressure.", authorIndex: 5, hasImage: false, daysAgo: 9 },
  ],
  "rmit-fitness": [
    { title: "Gym routine for exams — 20 minutes is enough?", body: "When time is short, what's the minimal effective workout to stay consistent?", authorIndex: 4, hasImage: true, daysAgo: 8 },
    { title: "Intramural sports sign-ups open", body: "Gathering a mixed team. All skill levels welcome, it's mostly about the fun.", authorIndex: 0, hasImage: false, daysAgo: 2 },
  ],
  "rmit-international": [
    { title: "First week as an international student — advice?", body: "Just landed. What do you wish someone told you before you started?", authorIndex: 3, hasImage: false, daysAgo: 17 },
    { title: "Processing the culture shift from home to Melbourne", body: "Some days are amazing, some days are lonely. Sharing how I'm navigating it.", authorIndex: 5, hasImage: true, daysAgo: 6 },
  ],
};

// ---------------------------------------------------------------------------
// Media seeding
// ---------------------------------------------------------------------------

/**
 * Ensures a media row whose object_key holds a remote image URL and returns
 * its id. Reused for society avatars, user avatars, and thread images.
 */
async function seedMedia(
  database: ReturnType<typeof createDatabase>,
  ownerId: string,
  objectKey: string,
  purpose: "avatar" | "thread_attachment",
  contentType = "image/jpeg",
): Promise<string> {
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
      ownerId,
      objectKey,
      purpose,
      contentType,
      byteSize: 1,
      checksum: null,
      status: "ready",
      createdAt: now,
      completedAt: now,
    })
    .returning({ id: mediaAssets.id });
  if (row === undefined) {
    throw new Error(`Seed media could not be created for key "${objectKey}"`);
  }
  return row.id;
}

// ---------------------------------------------------------------------------
// Seeding steps
// ---------------------------------------------------------------------------

async function seedUsers(
  database: ReturnType<typeof createDatabase>,
  passwordAdapter: LocalPasswordAdapter,
  credentialStore: DrizzlePasswordCredentialStore,
): Promise<readonly { id: string; index: number }[]> {
  const now = new Date();
  const seeded: { id: string; index: number }[] = [];

  for (const [index, user] of SEED_USERS.entries()) {
    const id = uuidFrom(1000 + index);
    seeded.push({ id, index });

    await database.db
      .insert(authUsers)
      .values({ id, email: user.email, passwordHash: "" })
      .onConflictDoNothing();

    // Only hash the dev password when not set, so re-seeding doesn't churn it.
    const stored = await credentialStore.get(id);
    if (stored === null || stored === "") {
      await passwordAdapter.setPassword(id, SEED_PASSWORD);
    }

    const avatarMediaId = await seedMedia(database, id, userAvatarUrl(user.imageSeed), "avatar");
    await database.db
      .insert(userProfiles)
      .values({
        userId: id,
        displayName: user.displayName,
        bio: user.bio,
        avatarMediaId,
        platformRole: "student",
        status: "active",
        isPublic: true,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing();
  }

  return seeded;
}

async function seedMemberships(
  database: ReturnType<typeof createDatabase>,
  societyIds: ReadonlyMap<string, string>,
  users: readonly { id: string; index: number }[],
): Promise<void> {
  const now = new Date();
  const userIdByIndex = new Map(users.map((user) => [user.index, user.id]));

  for (const [slug, plan] of Object.entries(SEED_MEMBERSHIPS)) {
    const societyId = societyIds.get(slug);
    if (societyId === undefined) continue;

    const rows = plan.members.map((userIndex) => {
      const userId = userIdByIndex.get(userIndex);
      if (userId === undefined) throw new Error(`Seed membership references missing user ${userIndex}`);
      return {
        societyId,
        userId,
        role: userIndex === plan.moderator ? ("moderator" as const) : ("member" as const),
        status: "active" as const,
        joinedAt: now,
        updatedAt: now,
      };
    });

    await database.db.insert(societyMemberships).values(rows).onConflictDoNothing();
  }
}

/** Returns thread ids keyed by a stable per-society, per-index id so votes/thread-media can reference them. */
async function seedThreads(
  database: ReturnType<typeof createDatabase>,
  societyIds: ReadonlyMap<string, string>,
  users: readonly { id: string; index: number }[],
): Promise<ReadonlyMap<string, string>> {
  const now = new Date();
  const ids: Map<string, string> = new Map(); // key `${slug}:${index}` -> threadId

  for (const society of SEED_SOCIETIES) {
    const societyId = societyIds.get(society.slug);
    const defs = THREADS_BY_SOCIETY[society.slug] ?? [];
    if (societyId === undefined) continue;

    for (const [index, def] of defs.entries()) {
      const threadId = uuidFrom(2000 + SEED_SOCIETIES.indexOf(society) * 100 + index);
      const author = users[def.authorIndex];
      if (author === undefined) continue;
      ids.set(`${society.slug}:${index}`, threadId);

      const createdAt = new Date(now.getTime() - def.daysAgo * 24 * 60 * 60 * 1000);
      await database.db
        .insert(threads)
        .values({
          id: threadId,
          societyId,
          authorId: author.id,
          title: def.title,
          body: def.body,
          status: "published",
          score: 0,
          commentCount: 0,
          createdAt,
          updatedAt: createdAt,
        })
        .onConflictDoNothing();

      if (def.hasImage) {
        const mediaId = await seedMedia(database, author.id, threadImageUrl(`${society.slug}-${index}`), "thread_attachment");
        await database.db
          .insert(threadMedia)
          .values({ threadId, mediaId, position: 0 })
          .onConflictDoNothing();
      }
    }
  }

  return ids;
}

interface GeneratedComment {
  readonly id: string;
  readonly threadId: string;
  readonly authorId: string;
  readonly parentId: string | null;
  readonly body: string;
  readonly createdAt: Date;
}

async function seedCommentsAndVotes(
  database: ReturnType<typeof createDatabase>,
  threadIds: ReadonlyMap<string, string>,
  users: readonly { id: string; index: number }[],
): Promise<void> {
  const now = new Date();

  const generatedComments: GeneratedComment[] = [];

  // Build per-thread generators with a deterministic RNG.
  const threadEntries = [...threadIds.entries()]; // ["rmit:0", id]
  for (let t = 0; t < threadEntries.length; t += 1) {
    const entry = threadEntries[t];
    if (entry === undefined) continue;
    const [slugindex, threadId] = entry;
    const rand = mulberry32(3000 + t);
    const commentCount = 2 + Math.floor(rand() * 4); // 2..5 comments per thread

    // Resolve the thread's author from its definition.
    const slug = slugindex.split(":")[0] ?? "";
    const idx = Number(slugindex.split(":")[1]);
    const def = THREADS_BY_SOCIETY[slug]?.[idx];
    const authorId = def ? users[def.authorIndex]?.id : undefined;
    if (authorId === undefined) continue;

    const threadCreated =
      (await database.db.select({ createdAt: threads.createdAt }).from(threads).where(eq(threads.id, threadId)).limit(1))[0];

    for (let c = 0; c < commentCount; c += 1) {
      const commentId = uuidFrom(4000 + t * 100 + c);
      const authorIdx = Math.floor(rand() * users.length);
      const author = users[authorIdx];
      if (author === undefined) continue;
      const body = THREAD_COMMENT_POOL[Math.floor(rand() * THREAD_COMMENT_POOL.length)] ?? "";
      const createdAt = new Date((threadCreated?.createdAt ?? now).getTime() + (c + 1) * 36e5);

      let parentId: string | null = null;
      if (c > 0 && rand() < 0.35) {
        const prev = generatedComments.reverse().find((item) => item.threadId === threadId);
        generatedComments.reverse();
        parentId = prev?.id ?? null;
      }

      generatedComments.push({ id: commentId, threadId, authorId: author.id, parentId, body, createdAt });
      await database.db
        .insert(comments)
        .values({ id: commentId, threadId, authorId: author.id, parentId, body, status: "published", score: 0, createdAt, updatedAt: createdAt })
        .onConflictDoNothing();
    }
  }

  // Update comment_count per thread.
  const countByThread = new Map<string, number>();
  for (const comment of generatedComments) {
    countByThread.set(comment.threadId, (countByThread.get(comment.threadId) ?? 0) + 1);
  }
  for (const [threadId, count] of countByThread) {
    await database.db.update(threads).set({ commentCount: count }).where(eq(threads.id, threadId));
  }

  // Votes: random-but-deterministic upvotes on threads and comments.
  await seedThreadVotes(database, threadIds, users);
  await seedCommentVotes(database, generatedComments, users);
}

async function seedThreadVotes(
  database: ReturnType<typeof createDatabase>,
  threadIds: ReadonlyMap<string, string>,
  users: readonly { id: string; index: number }[],
): Promise<void> {
  const threadEntries = [...threadIds.values()];
  for (let t = 0; t < threadEntries.length; t += 1) {
    const threadId = threadEntries[t];
    if (threadId === undefined) continue;
    const rand = mulberry32(5000 + t);
    let score = 0;
    const votes = [];

    for (const user of users) {
      const roll = rand();
      if (roll < 0.6) {
        const value = roll < 0.45 ? 1 : -1;
        score += value;
        votes.push({ threadId, userId: user.id, value, createdAt: new Date(), updatedAt: new Date() });
      }
    }
    if (votes.length > 0) {
      await database.db.insert(threadVotes).values(votes).onConflictDoNothing();
    }
    await database.db.update(threads).set({ score }).where(eq(threads.id, threadId));
  }
}

async function seedCommentVotes(
  database: ReturnType<typeof createDatabase>,
  generatedComments: GeneratedComment[],
  users: readonly { id: string; index: number }[],
): Promise<void> {
  for (let c = 0; c < generatedComments.length; c += 1) {
    const comment = generatedComments[c] as GeneratedComment;
    const rand = mulberry32(6000 + c);
    let score = 0;
    const votes = [];

    for (const user of users) {
      // Authors don't vote on their own comment (keeps demo clean).
      if (user.id === comment.authorId) continue;
      const roll = rand();
      if (roll < 0.5) {
        const value = roll < 0.4 ? 1 : -1;
        score += value;
        votes.push({ commentId: comment.id, userId: user.id, value, createdAt: new Date(), updatedAt: new Date() });
      }
    }
    if (votes.length > 0) {
      await database.db.insert(commentVotes).values(votes).onConflictDoNothing();
    }
    await database.db.update(comments).set({ score }).where(eq(comments.id, comment.id));
  }
}

async function main(): Promise<void> {
  loadDotenv({ quiet: true });
  const config = loadConfig();
  const logger = createLogger(config);
  const database = createDatabase(config, logger);
  const credentialStore = new DrizzlePasswordCredentialStore(database.db);
  const passwordAdapter = new LocalPasswordAdapter(credentialStore);

  try {
    await database.checkConnection();

    const now = new Date();

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
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing();

    // 2. Seed societies and, per society, its rules (both idempotent).
    const societyIds: Map<string, string> = new Map();
    for (const seed of SEED_SOCIETIES) {
      const avatarMediaId = await seedMedia(database, SEED_OWNER.id, picsum(`society-${seed.slug}`, 400, 400), "avatar");
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

      // Re-point avatar to the remote picsum URL row (idempotent); handles rows
      // that predate the remote-image scheme.
      await database.db
        .update(societies)
        .set({ avatarMediaId })
        .where(eq(societies.slug, seed.slug));

      const [existing] = await database.db
        .select({ id: societies.id })
        .from(societies)
        .where(sql`${societies.slug} = ${seed.slug}`)
        .limit(1);

      if (existing === undefined) {
        throw new Error(`Seeded society "${seed.slug}" not found after insert`);
      }
      societyIds.set(seed.slug, existing.id);

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

    // 3. Users, memberships, threads, comments, votes.
    const users = await seedUsers(database, passwordAdapter, credentialStore);
    console.log(`[seed] ensured ${users.length} student user(s).`);

    await seedMemberships(database, societyIds, users);
    console.log("[seed] ensured society memberships.");

    const threadIds = await seedThreads(database, societyIds, users);
    console.log(`[seed] ensured ${threadIds.size} thread(s).`);

    await seedCommentsAndVotes(database, threadIds, users);
    console.log("[seed] ensured comments and votes.");

    console.log(`[seed] done: ${SEED_SOCIETIES.length} societies, ${users.length} users.`);
  } finally {
    await database.close();
  }
}

main().catch((error) => {
  console.error("[seed] failed:", error);
  process.exitCode = 1;
});
