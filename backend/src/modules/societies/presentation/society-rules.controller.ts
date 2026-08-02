import type { Context } from "hono";

import type { AppEnvironment } from "../../../app-types";
import type {
  CreateRuleCommand,
  UpdateRuleCommand,
} from "../application/society.dto";
import type { SocietyService } from "../application/society.service";
import { requireInjectedPrincipal, societyErrorResponse, validated } from "./http.helpers";

export interface SocietyRulesControllerDependencies {
  readonly societyService: SocietyService;
}

interface SocietyPathParams {
  readonly societyId: string;
}

interface RulePathParams extends SocietyPathParams {
  readonly ruleId: string;
}

export function createSocietyRulesController(
  dependencies: SocietyRulesControllerDependencies,
) {
  return {
    async list(context: Context<AppEnvironment>): Promise<Response> {
      try {
        const { societyId } = validated<SocietyPathParams>(context, "param");
        const result = await dependencies.societyService.listRules(societyId);
        return context.json(result, 200);
      } catch (error) {
        return societyErrorResponse(context, error);
      }
    },

    async get(context: Context<AppEnvironment>): Promise<Response> {
      try {
        const { societyId, ruleId } = validated<RulePathParams>(context, "param");
        const result = await dependencies.societyService.getRule(societyId, ruleId);
        return context.json(result, 200);
      } catch (error) {
        return societyErrorResponse(context, error);
      }
    },

    async create(context: Context<AppEnvironment>): Promise<Response> {
      try {
        const principal = requireInjectedPrincipal(context);
        const { societyId } = validated<SocietyPathParams>(context, "param");
        const command = validated<CreateRuleCommand>(context, "json");
        const result = await dependencies.societyService.createRule(
          principal,
          societyId,
          command,
        );
        return context.json(result, 201);
      } catch (error) {
        return societyErrorResponse(context, error);
      }
    },

    async update(context: Context<AppEnvironment>): Promise<Response> {
      try {
        const principal = requireInjectedPrincipal(context);
        const { societyId, ruleId } = validated<RulePathParams>(context, "param");
        const command = validated<UpdateRuleCommand>(context, "json");
        const result = await dependencies.societyService.updateRule(
          principal,
          societyId,
          ruleId,
          command,
        );
        return context.json(result, 200);
      } catch (error) {
        return societyErrorResponse(context, error);
      }
    },

    async remove(context: Context<AppEnvironment>): Promise<Response> {
      try {
        const principal = requireInjectedPrincipal(context);
        const { societyId, ruleId } = validated<RulePathParams>(context, "param");
        await dependencies.societyService.deleteRule(principal, societyId, ruleId);
        return context.body(null, 204);
      } catch (error) {
        return societyErrorResponse(context, error);
      }
    },
  };
}
