import type { Context } from "hono";

import type { AppEnvironment } from "../../../app-types.js";
import type { AdminUserService } from "../application/admin-user.service.js";
import type { SetUserRoleCommand, SuspendUserCommand } from "../application/identity.dto.js";
import { identityErrorResponse, requireInjectedPrincipal } from "./http.helpers.js";

export interface AdminUserControllerDependencies {
  readonly adminUserService: AdminUserService;
}

export function createAdminUserController(dependencies: AdminUserControllerDependencies) {
  return {
    async suspend(context: Context<AppEnvironment>): Promise<Response> {
      try {
        const principal = requireInjectedPrincipal(context);
        const body = (await context.req.json()) as { suspendedUntil?: string | null };
        const command: SuspendUserCommand = {
          suspendedUntil: body.suspendedUntil === undefined || body.suspendedUntil === null
            ? null
            : new Date(body.suspendedUntil),
        };
        const result = await dependencies.adminUserService.suspendUser(
          principal,
          context.req.param("userId") ?? "",
          command,
        );
        return context.json(result, 200);
      } catch (error) {
        return identityErrorResponse(context, error);
      }
    },

    async deactivate(context: Context<AppEnvironment>): Promise<Response> {
      try {
        const principal = requireInjectedPrincipal(context);
        const result = await dependencies.adminUserService.deactivateUser(
          principal,
          context.req.param("userId") ?? "",
        );
        return context.json(result, 200);
      } catch (error) {
        return identityErrorResponse(context, error);
      }
    },

    async setRole(context: Context<AppEnvironment>): Promise<Response> {
      try {
        const principal = requireInjectedPrincipal(context);
        const command = (await context.req.json()) as SetUserRoleCommand;
        const result = await dependencies.adminUserService.setRole(
          principal,
          context.req.param("userId") ?? "",
          command,
        );
        return context.json(result, 200);
      } catch (error) {
        return identityErrorResponse(context, error);
      }
    },
  };
}
