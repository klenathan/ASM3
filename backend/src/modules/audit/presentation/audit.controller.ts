import type { Context } from "hono";

import type { AppEnvironment } from "../../../app-types";
import {
  DEFAULT_PAGE_SIZE,
  type PageRequest,
} from "../../../shared/application/pagination";
import type { AuditTrailService } from "../application/audit-trail.service";
import { auditErrorResponse, requireInjectedPrincipal, validated } from "./audit.http.helpers";

export interface AuditControllerDependencies {
  readonly auditService: AuditTrailService;
}

interface AuditListQuery {
  readonly cursor?: string;
  readonly limit?: number;
}

export function createAuditController(dependencies: AuditControllerDependencies) {
  return {
    async listEvents(context: Context<AppEnvironment>): Promise<Response> {
      try {
        const principal = requireInjectedPrincipal(context);
        const query = validated<AuditListQuery>(context, "query");
        const page: PageRequest = {
          limit: query.limit ?? DEFAULT_PAGE_SIZE,
          ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
        };
        const result = await dependencies.auditService.listEvents(principal, page);
        return context.json(result, 200);
      } catch (error) {
        return auditErrorResponse(context, error);
      }
    },
  };
}
