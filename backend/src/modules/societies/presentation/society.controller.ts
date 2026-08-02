import type { Context } from "hono";

import type { AppEnvironment } from "../../../app-types.js";
import type { PageRequest } from "../../../shared/application/pagination.js";
import type { CreateSocietyCommand } from "../application/society.dto.js";
import type { SocietyService } from "../application/society.service.js";
import { requireInjectedPrincipal, societyErrorResponse, validated } from "./http.helpers.js";

export interface SocietyControllerDependencies {
  readonly societyService: SocietyService;
}

interface SocietyPathParams {
  readonly societyId: string;
}

interface SocietyDiscoveryQuery {
  readonly limit?: number;
  readonly cursor?: string;
}

export function createSocietyController(dependencies: SocietyControllerDependencies) {
  return {
    async discover(context: Context<AppEnvironment>): Promise<Response> {
      try {
        const query = validated<SocietyDiscoveryQuery>(context, "query");
        const page: PageRequest = query.cursor === undefined
          ? { limit: query.limit ?? 20 }
          : { limit: query.limit ?? 20, cursor: query.cursor };
        const result = await dependencies.societyService.discover(page);
        return context.json(result, 200);
      } catch (error) {
        return societyErrorResponse(context, error);
      }
    },

    async get(context: Context<AppEnvironment>): Promise<Response> {
      try {
        const { societyId } = validated<SocietyPathParams>(context, "param");
        const result = await dependencies.societyService.getSociety(societyId);
        return context.json(result, 200);
      } catch (error) {
        return societyErrorResponse(context, error);
      }
    },

    async create(context: Context<AppEnvironment>): Promise<Response> {
      try {
        const principal = requireInjectedPrincipal(context);
        const command = validated<CreateSocietyCommand>(context, "json");
        const result = await dependencies.societyService.createSociety(principal, command);
        return context.json(result, 201);
      } catch (error) {
        return societyErrorResponse(context, error);
      }
    },
  };
}
