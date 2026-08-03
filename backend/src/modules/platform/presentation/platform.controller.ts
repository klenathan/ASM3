import type { Context } from "hono";

import type { AppEnvironment } from "../../../app-types";
import type { PlatformConfigKey } from "../domain/platform";
import type { PlatformService } from "../application/platform.service";
import { platformErrorResponse, requireInjectedPrincipal, validated } from "./http.helpers";

export interface PlatformControllerDependencies {
  readonly platformService: PlatformService;
}

interface ConfigKeyParams {
  readonly key: PlatformConfigKey;
}

interface PutConfigBody {
  readonly value: string;
}

export function createPlatformController(dependencies: PlatformControllerDependencies) {
  return {
    async listConfig(context: Context<AppEnvironment>): Promise<Response> {
      try {
        const principal = requireInjectedPrincipal(context);
        const items = await dependencies.platformService.listConfig(principal);
        return context.json({ items }, 200);
      } catch (error) {
        return platformErrorResponse(context, error);
      }
    },

    async putConfig(context: Context<AppEnvironment>): Promise<Response> {
      try {
        const principal = requireInjectedPrincipal(context);
        const { key } = validated<ConfigKeyParams>(context, "param");
        const body = validated<PutConfigBody>(context, "json");
        const result = await dependencies.platformService.upsertConfig(
          principal,
          key,
          body.value,
        );
        return context.json(result, 200);
      } catch (error) {
        return platformErrorResponse(context, error);
      }
    },

    async health(context: Context<AppEnvironment>): Promise<Response> {
      try {
        const principal = requireInjectedPrincipal(context);
        const result = await dependencies.platformService.health(principal);
        return context.json(result, 200);
      } catch (error) {
        return platformErrorResponse(context, error);
      }
    },
  };
}
