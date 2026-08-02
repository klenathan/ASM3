import { z } from "@hono/zod-openapi";

export const errorSchema = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      requestId: z.string(),
      details: z.record(z.string(), z.unknown()),
    }),
  })
  .openapi("SocietyErrorResponse");

export const societySchema = z
  .object({
    id: z.string().uuid(),
    slug: z.string(),
    name: z.string(),
    description: z.string(),
    status: z.enum(["active", "archived"]),
    createdBy: z.string().uuid(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .openapi("Society");

export const societyPageSchema = z
  .object({
    items: z.array(societySchema),
    nextCursor: z.string().nullable(),
    hasMore: z.boolean(),
  })
  .openapi("SocietyPage");

export const createSocietyRequestSchema = z
  .object({
    slug: z.string().trim().min(1).max(64),
    name: z.string().trim().min(1).max(100),
    description: z.string().trim().min(1).max(1000),
  })
  .openapi("CreateSocietyRequest");

export const membershipSchema = z
  .object({
    societyId: z.string().uuid(),
    userId: z.string().uuid(),
    role: z.enum(["member", "moderator"]),
    status: z.enum(["active", "left", "banned"]),
    joinedAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    bannedBy: z.string().uuid().nullable(),
    bannedAt: z.string().datetime().nullable(),
  })
  .openapi("SocietyMembership");

export const membershipResponseSchema = membershipSchema.nullable().openapi("MembershipResponse");

export const addModeratorRequestSchema = z
  .object({
    userId: z.string().uuid(),
  })
  .openapi("AddModeratorRequest");

export const ruleSchema = z
  .object({
    id: z.string().uuid(),
    societyId: z.string().uuid(),
    position: z.number().int().positive(),
    title: z.string(),
    description: z.string(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .openapi("SocietyRule");

export const createRuleRequestSchema = z
  .object({
    position: z.number().int().positive(),
    title: z.string().trim().min(1).max(100),
    description: z.string().trim().min(1).max(500),
  })
  .openapi("CreateSocietyRuleRequest");

export const updateRuleRequestSchema = z
  .object({
    position: z.number().int().positive().optional(),
    title: z.string().trim().min(1).max(100).optional(),
    description: z.string().trim().min(1).max(500).optional(),
  })
  .openapi("UpdateSocietyRuleRequest");

export const societyDiscoveryQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).optional(),
    cursor: z.string().min(1).optional(),
  })
  .openapi("SocietyDiscoveryQuery");

export const societyRulesSchema = z.array(ruleSchema).openapi("SocietyRules");
