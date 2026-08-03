import { z } from "@hono/zod-openapi";

export const userSchema = z
  .object({
    userId: z.string().uuid(),
    email: z.string().email(),
    displayName: z.string(),
    bio: z.string().nullable(),
    avatarMediaId: z.string().uuid().nullable(),
    platformRole: z.enum(["student", "system_admin"]),
    status: z.enum(["active", "suspended", "deactivated"]),
    isPublic: z.boolean(),
    suspendedUntil: z.string().datetime().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .openapi("IdentityUser");

export const userPageSchema = z
  .object({
    items: z.array(userSchema),
    nextCursor: z.string().nullable(),
    hasMore: z.boolean(),
  })
  .openapi("IdentityUserPage");

export const adminUsersPageQuerySchema = z
  .object({
    search: z.string().max(120).optional(),
    status: z.enum(["active", "suspended", "deactivated"]).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    cursor: z.string().min(1).optional(),
  })
  .openapi("AdminUsersPageQuery");

export const authResultSchema = z
  .object({
    user: userSchema,
    sessionToken: z.string(),
    expiresAt: z.string().datetime(),
  })
  .openapi("AuthResult");

export const registerRequestSchema = z
  .object({
    email: z.string().trim().email().max(320),
    password: z.string().min(8).max(128),
    displayName: z.string().trim().min(1).max(80),
    bio: z.string().max(500).nullable().optional(),
  })
  .openapi("RegisterRequest");

export const signInRequestSchema = z
  .object({
    email: z.string().trim().email().max(320),
    password: z.string().min(1).max(128),
  })
  .openapi("SignInRequest");

export const updateProfileRequestSchema = z
  .object({
    displayName: z.string().trim().min(1).max(80).optional(),
    bio: z.string().max(500).nullable().optional(),
    avatarMediaId: z.string().uuid().nullable().optional(),
    isPublic: z.boolean().optional(),
  })
  .openapi("UpdateProfileRequest");

export const publicUserSchema = z
  .object({
    userId: z.string().uuid(),
    displayName: z.string(),
    bio: z.string().nullable(),
    avatarMediaId: z.string().uuid().nullable(),
    platformRole: z.enum(["student", "system_admin"]),
    status: z.enum(["active", "suspended", "deactivated"]),
    isPublic: z.boolean(),
    isOwner: z.boolean(),
    createdAt: z.string().datetime(),
  })
  .openapi("PublicUser");

export const suspendUserRequestSchema = z
  .object({
    suspendedUntil: z.string().datetime().nullable().optional(),
  })
  .openapi("SuspendUserRequest");

export const setUserRoleRequestSchema = z
  .object({
    platformRole: z.enum(["student", "system_admin"]),
  })
  .openapi("SetUserRoleRequest");

export const errorSchema = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      requestId: z.string(),
      details: z.record(z.string(), z.unknown()),
    }),
  })
  .openapi("ErrorResponse");
