import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";

import type { AppEnvironment } from "../../../app-types";
import type { AdminUserService } from "../application/admin-user.service";
import type { AuthService } from "../application/auth.service";
import type { UserService } from "../application/user.service";
import { createAdminUserController } from "./admin-user.controller";
import { sessionPrincipalMiddleware } from "./auth.middleware";
import { createAuthController } from "./auth.controller";
import { createUserController } from "./user.controller";
import {
  adminUsersPageQuerySchema,
  authResultSchema,
  errorSchema,
  publicUserSchema,
  registerRequestSchema,
  setUserRoleRequestSchema,
  signInRequestSchema,
  suspendUserRequestSchema,
  updateProfileRequestSchema,
  userPageSchema,
  userSchema,
} from "./identity.schemas";

const userIdParams = z.object({
  userId: z.string().uuid(),
});

const registerRoute = createRoute({
  method: "post",
  path: "/api/v1/auth/register",
  tags: ["Identity"],
  summary: "Register an RMIT community account",
  request: {
    body: {
      content: { "application/json": { schema: registerRequestSchema } },
    },
  },
  responses: {
    201: {
      description: "Account registered",
      content: { "application/json": { schema: authResultSchema } },
    },
    400: { description: "Invalid registration input", content: { "application/json": { schema: errorSchema } } },
    403: { description: "Registration is not allowed", content: { "application/json": { schema: errorSchema } } },
    409: { description: "Email is already registered", content: { "application/json": { schema: errorSchema } } },
    503: { description: "Registration configuration is unavailable", content: { "application/json": { schema: errorSchema } } },
  },
});

const signInRoute = createRoute({
  method: "post",
  path: "/api/v1/auth/sign-in",
  tags: ["Identity"],
  summary: "Sign in with an RMIT account",
  request: {
    body: {
      content: { "application/json": { schema: signInRequestSchema } },
    },
  },
  responses: {
    200: {
      description: "Signed in",
      content: { "application/json": { schema: authResultSchema } },
    },
    401: { description: "Invalid credentials", content: { "application/json": { schema: errorSchema } } },
    403: { description: "Account cannot sign in", content: { "application/json": { schema: errorSchema } } },
  },
});

const signOutRoute = createRoute({
  method: "post",
  path: "/api/v1/auth/sign-out",
  tags: ["Identity"],
  summary: "Sign out the current session",
  responses: {
    204: { description: "Signed out" },
    401: { description: "Authentication is required", content: { "application/json": { schema: errorSchema } } },
  },
});

const authMeRoute = createRoute({
  method: "get",
  path: "/api/v1/auth/me",
  tags: ["Identity"],
  summary: "Get the current authenticated user",
  responses: {
    200: { description: "Current user", content: { "application/json": { schema: userSchema } } },
    401: { description: "Authentication is required", content: { "application/json": { schema: errorSchema } } },
    403: { description: "Account cannot be used", content: { "application/json": { schema: errorSchema } } },
  },
});

const getProfileRoute = createRoute({
  method: "get",
  path: "/api/v1/users/me",
  tags: ["Identity"],
  summary: "Get the current user profile",
  responses: {
    200: { description: "Current profile", content: { "application/json": { schema: userSchema } } },
    401: { description: "Authentication is required", content: { "application/json": { schema: errorSchema } } },
    403: { description: "Account cannot be used", content: { "application/json": { schema: errorSchema } } },
  },
});

const listUsersRoute = createRoute({
  method: "get",
  path: "/api/v1/admin/users",
  tags: ["Identity administration"],
  summary: "List the platform user directory",
  request: { query: adminUsersPageQuerySchema },
  responses: {
    200: { description: "User directory", content: { "application/json": { schema: userPageSchema } } },
    400: { description: "Invalid pagination", content: { "application/json": { schema: errorSchema } } },
    401: { description: "Authentication is required", content: { "application/json": { schema: errorSchema } } },
    403: { description: "System-admin access is required", content: { "application/json": { schema: errorSchema } } },
  },
});

const getPublicUserRoute = createRoute({
  method: "get",
  path: "/api/v1/users/{userId}",
  tags: ["Identity"],
  summary: "Get a public user profile",
  request: { params: userIdParams },
  responses: {
    200: { description: "Public profile", content: { "application/json": { schema: publicUserSchema } } },
    401: { description: "Authentication is required", content: { "application/json": { schema: errorSchema } } },
    404: { description: "User was not found", content: { "application/json": { schema: errorSchema } } },
  },
});

const updateProfileRoute = createRoute({
  method: "patch",
  path: "/api/v1/users/me",
  tags: ["Identity"],
  summary: "Update the current user profile",
  request: {
    body: {
      content: { "application/json": { schema: updateProfileRequestSchema } },
    },
  },
  responses: {
    200: { description: "Updated profile", content: { "application/json": { schema: userSchema } } },
    400: { description: "Invalid profile input", content: { "application/json": { schema: errorSchema } } },
    401: { description: "Authentication is required", content: { "application/json": { schema: errorSchema } } },
    403: { description: "Account cannot be used", content: { "application/json": { schema: errorSchema } } },
  },
});

const suspendUserRoute = createRoute({
  method: "post",
  path: "/api/v1/admin/users/{userId}/suspend",
  tags: ["Identity administration"],
  summary: "Suspend a user account",
  request: {
    params: userIdParams,
    body: { content: { "application/json": { schema: suspendUserRequestSchema } } },
  },
  responses: {
    200: { description: "Suspended user", content: { "application/json": { schema: userSchema } } },
    400: { description: "Invalid suspension", content: { "application/json": { schema: errorSchema } } },
    401: { description: "Authentication is required", content: { "application/json": { schema: errorSchema } } },
    403: { description: "System-admin access is required", content: { "application/json": { schema: errorSchema } } },
    404: { description: "User was not found", content: { "application/json": { schema: errorSchema } } },
  },
});

const deactivateUserRoute = createRoute({
  method: "post",
  path: "/api/v1/admin/users/{userId}/deactivate",
  tags: ["Identity administration"],
  summary: "Deactivate a user account",
  request: { params: userIdParams },
  responses: {
    200: { description: "Deactivated user", content: { "application/json": { schema: userSchema } } },
    401: { description: "Authentication is required", content: { "application/json": { schema: errorSchema } } },
    403: { description: "System-admin access is required", content: { "application/json": { schema: errorSchema } } },
    404: { description: "User was not found", content: { "application/json": { schema: errorSchema } } },
  },
});

const activateUserRoute = createRoute({
  method: "post",
  path: "/api/v1/admin/users/{userId}/activate",
  tags: ["Identity administration"],
  summary: "Activate (unban) a deactivated user account",
  request: { params: userIdParams },
  responses: {
    200: { description: "Activated user", content: { "application/json": { schema: userSchema } } },
    401: { description: "Authentication is required", content: { "application/json": { schema: errorSchema } } },
    403: { description: "System-admin access is required", content: { "application/json": { schema: errorSchema } } },
    404: { description: "User was not found", content: { "application/json": { schema: errorSchema } } },
  },
});

const setRoleRoute = createRoute({
  method: "patch",
  path: "/api/v1/admin/users/{userId}/role",
  tags: ["Identity administration"],
  summary: "Set a platform role",
  request: {
    params: userIdParams,
    body: { content: { "application/json": { schema: setUserRoleRequestSchema } } },
  },
  responses: {
    200: { description: "Updated user role", content: { "application/json": { schema: userSchema } } },
    401: { description: "Authentication is required", content: { "application/json": { schema: errorSchema } } },
    403: { description: "System-admin access is required", content: { "application/json": { schema: errorSchema } } },
    404: { description: "User was not found", content: { "application/json": { schema: errorSchema } } },
  },
});

export interface IdentityRouteDependencies {
  readonly authService: AuthService;
  readonly userService: UserService;
  readonly adminUserService?: AdminUserService;
  readonly secureCookies?: boolean;
  readonly cookieName?: string;
}

export function registerIdentityRoutes(
  app: OpenAPIHono<AppEnvironment>,
  dependencies: IdentityRouteDependencies,
): void {
  const authController = createAuthController(dependencies);
  const userController = createUserController(dependencies);
  const principalMiddleware = sessionPrincipalMiddleware({
    authService: dependencies.authService,
    ...(dependencies.cookieName === undefined ? {} : { cookieName: dependencies.cookieName }),
  });

  app.use("/api/v1/auth/me", principalMiddleware);
  app.use("/api/v1/users/me", principalMiddleware);
  app.use("/api/v1/users/*", principalMiddleware);
  app.use("/api/v1/admin/users", principalMiddleware);
  app.use("/api/v1/admin/users/*", principalMiddleware);

  app.openapi(registerRoute, (context) => authController.register(context) as never);
  app.openapi(signInRoute, (context) => authController.signIn(context) as never);
  app.openapi(signOutRoute, (context) => authController.signOut(context) as never);
  app.openapi(authMeRoute, (context) => authController.currentUser(context) as never);
  app.openapi(getProfileRoute, (context) => userController.getProfile(context) as never);
  app.openapi(getPublicUserRoute, (context) => userController.getPublicUser(context) as never);
  app.openapi(updateProfileRoute, (context) => userController.updateProfile(context) as never);

  if (dependencies.adminUserService !== undefined) {
    const adminController = createAdminUserController({
      adminUserService: dependencies.adminUserService,
    });
    app.openapi(listUsersRoute, (context) => adminController.list(context) as never);
    app.openapi(suspendUserRoute, (context) => adminController.suspend(context) as never);
    app.openapi(deactivateUserRoute, (context) => adminController.deactivate(context) as never);
    app.openapi(activateUserRoute, (context) => adminController.activate(context) as never);
    app.openapi(setRoleRoute, (context) => adminController.setRole(context) as never);
  }
}
