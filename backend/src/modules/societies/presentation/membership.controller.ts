import type { Context } from "hono";

import type { AppEnvironment } from "../../../app-types";
import type { AddModeratorCommand } from "../application/society.dto";
import type { MembershipService } from "../application/membership.service";
import { requireInjectedPrincipal, societyErrorResponse, validated } from "./http.helpers";

export interface MembershipControllerDependencies {
  readonly membershipService: MembershipService;
}

interface SocietyPathParams {
  readonly societyId: string;
}

interface ModeratorPathParams extends SocietyPathParams {
  readonly userId: string;
}

export function createMembershipController(dependencies: MembershipControllerDependencies) {
  return {
    async get(context: Context<AppEnvironment>): Promise<Response> {
      try {
        const principal = requireInjectedPrincipal(context);
        const { societyId } = validated<SocietyPathParams>(context, "param");
        const result = await dependencies.membershipService.getMembership(principal, societyId);
        return context.json(result, 200);
      } catch (error) {
        return societyErrorResponse(context, error);
      }
    },

    async join(context: Context<AppEnvironment>): Promise<Response> {
      try {
        const principal = requireInjectedPrincipal(context);
        const { societyId } = validated<SocietyPathParams>(context, "param");
        const result = await dependencies.membershipService.join(principal, societyId);
        return context.json(result, 200);
      } catch (error) {
        return societyErrorResponse(context, error);
      }
    },

    async leave(context: Context<AppEnvironment>): Promise<Response> {
      try {
        const principal = requireInjectedPrincipal(context);
        const { societyId } = validated<SocietyPathParams>(context, "param");
        await dependencies.membershipService.leave(principal, societyId);
        return context.body(null, 204);
      } catch (error) {
        return societyErrorResponse(context, error);
      }
    },

    async addModerator(context: Context<AppEnvironment>): Promise<Response> {
      try {
        const principal = requireInjectedPrincipal(context);
        const { societyId } = validated<SocietyPathParams>(context, "param");
        const command = validated<AddModeratorCommand>(context, "json");
        const result = await dependencies.membershipService.addModerator(
          principal,
          societyId,
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
        const { societyId, userId } = validated<ModeratorPathParams>(context, "param");
        const result = await dependencies.membershipService.removeModerator(
          principal,
          societyId,
          userId,
        );
        return context.json(result, 200);
      } catch (error) {
        return societyErrorResponse(context, error);
      }
    },
  };
}
