import type { Context } from "hono";

import type { AppEnvironment } from "../../../app-types";
import type { UpdateProfileCommand } from "../application/identity.dto";
import type { UserService } from "../application/user.service";
import {
  getInjectedPrincipal,
  identityErrorResponse,
  requireInjectedPrincipal,
} from "./http.helpers";

export interface UserControllerDependencies {
  readonly userService: UserService;
}

export function createUserController(dependencies: UserControllerDependencies) {
  return {
    async getProfile(context: Context<AppEnvironment>): Promise<Response> {
      try {
        const principal = requireInjectedPrincipal(context);
        const result = await dependencies.userService.getProfile(principal);
        return context.json(result, 200);
      } catch (error) {
        return identityErrorResponse(context, error);
      }
    },

    async updateProfile(context: Context<AppEnvironment>): Promise<Response> {
      try {
        const principal = requireInjectedPrincipal(context);
        const command = (await context.req.json()) as UpdateProfileCommand;
        const result = await dependencies.userService.updateProfile(principal, command);
        return context.json(result, 200);
      } catch (error) {
        return identityErrorResponse(context, error);
      }
    },

    async getPublicUser(context: Context<AppEnvironment>): Promise<Response> {
      try {
        const { userId } = context.req.param() as { userId: string };
        const result = await dependencies.userService.getPublicProfile(
          getInjectedPrincipal(context),
          userId,
        );
        return context.json(result, 200);
      } catch (error) {
        return identityErrorResponse(context, error);
      }
    },
  };
}
