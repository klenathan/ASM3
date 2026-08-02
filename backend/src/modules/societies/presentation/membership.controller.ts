import type { Context } from "hono";

import type { AppEnvironment } from "../../../app-types";
import type { AddModeratorCommand } from "../application/society.dto";
import type { MembershipService } from "../application/membership.service";
import { requireInjectedPrincipal, societyErrorResponse, validated } from "./http.helpers";

export interface MembershipControllerDependencies {
  readonly membershipService: MembershipService;
}

interface SocietyPathParams {
  readonly societySlug: string;
}

interface ModeratorPathParams extends SocietyPathParams {
  readonly userId: string;
}

export function createMembershipController(dependencies: MembershipControllerDependencies) {
  return {
    async get(context: Context<AppEnvironment>): Promise<Response> {
      try {
        const principal = requireInjectedPrincipal(context);
        const { societySlug } = validated<SocietyPathParams>(context, "param");
        const result = await dependencies.membershipService.getMembership(principal, societySlug);
        return context.json(result, 200);
      } catch (error) {
        return societyErrorResponse(context, error);
      }
    },

    async join(context: Context<AppEnvironment>): Promise<Response> {
      try {
        const principal = requireInjectedPrincipal(context);
        const { societySlug } = validated<SocietyPathParams>(context, "param");
        const result = await dependencies.membershipService.join(principal, societySlug);
        return context.json(result, 200);
      } catch (error) {
        return societyErrorResponse(context, error);
      }
    },

    async leave(context: Context<AppEnvironment>): Promise<Response> {
      try {
        const principal = requireInjectedPrincipal(context);
        const { societySlug } = validated<SocietyPathParams>(context, "param");
        await dependencies.membershipService.leave(principal, societySlug);
        return context.body(null, 204);
      } catch (error) {
        return societyErrorResponse(context, error);
      }
    },

    async addModerator(context: Context<AppEnvironment>): Promise<Response> {
      try {
        const principal = requireInjectedPrincipal(context);
        const { societySlug } = validated<SocietyPathParams>(context, "param");
        const command = validated<AddModeratorCommand>(context, "json");
        const result = await dependencies.membershipService.addModerator(
          principal,
          societySlug,
          command,
        );
        return context.json(result, 200);
      } catch (error) {
        return societyErrorResponse(context, error);
      }
    },

    async removeModerator(context: Context<AppEnvironment>): Promise<Response> {
      try {
        const principal = requireInjectedPrincipal(context);
        const { societySlug, userId } = validated<ModeratorPathParams>(context, "param");
        const result = await dependencies.membershipService.removeModerator(
          principal,
          societySlug,
          userId,
        );
        return context.json(result, 200);
      } catch (error) {
        return societyErrorResponse(context, error);
      }
    },
  };
}
