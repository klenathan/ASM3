import type { Context } from "hono";

import type { AppEnvironment } from "../../../app-types";
import type { PageRequest } from "../../../shared/application/pagination";
import type { CreateSocietyCommand, SocietyDiscoveryQuery } from "../application/society.dto";
import type { SocietyService } from "../application/society.service";
import {
  getInjectedPrincipal,
  requireInjectedPrincipal,
  societyErrorResponse,
  validated,
} from "./http.helpers";

export interface SocietyControllerDependencies {
  readonly societyService: SocietyService;
}

interface SocietyPathParams {
  readonly societySlug: string;
}

export function createSocietyController(dependencies: SocietyControllerDependencies) {
  return {
    async discover(context: Context<AppEnvironment>): Promise<Response> {
      try {
        const query = validated<SocietyDiscoveryQuery>(context, "query");
        const page: SocietyDiscoveryQuery & PageRequest = {
          limit: query.limit ?? 20,
          ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
          ...(query.q === undefined ? {} : { q: query.q }),
        };
        const principal = getInjectedPrincipal(context);
        const result = await dependencies.societyService.discover(page, principal);
        return context.json(result, 200);
      } catch (error) {
        return societyErrorResponse(context, error);
      }
    },

    async get(context: Context<AppEnvironment>): Promise<Response> {
      try {
        const { societySlug } = validated<SocietyPathParams>(context, "param");
        const result = await dependencies.societyService.getSociety(societySlug);
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
