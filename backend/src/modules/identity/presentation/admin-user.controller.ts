import type { Context } from "hono";

import type { AppEnvironment } from "../../../app-types";
import type { AdminUserService } from "../application/admin-user.service";
import type { SetUserRoleCommand, SuspendUserCommand } from "../application/identity.dto";
import { identityErrorResponse, requireInjectedPrincipal, validated } from "./http.helpers";

export interface AdminUserControllerDependencies {
  readonly adminUserService: AdminUserService;
}

interface ListUsersQuery {
  readonly search?: string;
  readonly status?: "active" | "suspended" | "deactivated";
  readonly limit?: number;
  readonly cursor?: string;
}

export function createAdminUserController(dependencies: AdminUserControllerDependencies) {
  return {
    async list(context: Context<AppEnvironment>): Promise<Response> {
      try {
        const principal = requireInjectedPrincipal(context);
        const query = validated<ListUsersQuery>(context, "query");
        const limit = query.limit ?? 20;
        const result = await dependencies.adminUserService.listUsers(
          principal,
          query.cursor === undefined ? { limit } : { limit, cursor: query.cursor },
          {
            ...(query.search === undefined ? {} : { search: query.search }),
            ...(query.status === undefined ? {} : { status: query.status }),
          },
        );
        return context.json(result, 200);
      } catch (error) {
        return identityErrorResponse(context, error);
      }
    },

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
