import type { Context } from "hono";

import type { AppEnvironment } from "../../../app-types";
import type {
  CreateReportCommand,
  DismissReportCommand,
  ResolveReportCommand,
} from "../application/moderation.dto";
import type { ModerationService } from "../application/moderation.service";
import type { ReportService } from "../application/report.service";
import {
  moderationErrorResponse,
  requireInjectedPrincipal,
  validated,
} from "./http.helpers";

export interface ModerationControllerDependencies {
  readonly reportService: ReportService;
  readonly moderationService: ModerationService;
}

interface PageQuery {
  readonly limit?: number;
  readonly cursor?: string;
}

interface GlobalReportsQuery extends PageQuery {
  readonly status?: "pending" | "in_review" | "resolved" | "dismissed";
}

interface ReportPathParams {
  readonly reportId: string;
}

interface SocietyPathParams {
  readonly societySlug: string;
}

interface ResolveReportBody {
  readonly action: ResolveReportCommand["action"];
  readonly resolutionNote?: string;
  readonly suspendedUntil?: string | null;
}

interface DismissReportBody {
  readonly resolutionNote?: string;
}

interface ModerationDecisionBody extends DismissReportBody {
  readonly status: "resolved" | "dismissed";
  readonly action?: ResolveReportCommand["action"];
  readonly suspendedUntil?: string | null;
}

export function createModerationController(dependencies: ModerationControllerDependencies) {
  return {
    async createReport(context: Context<AppEnvironment>): Promise<Response> {
      try {
        const principal = requireInjectedPrincipal(context);
        const command = validated<CreateReportCommand>(context, "json");
        const result = await dependencies.reportService.createReport(principal, command);
        return context.json(result, 201);
      } catch (error) {
        return moderationErrorResponse(context, error);
      }
    },

    async listReporterReports(context: Context<AppEnvironment>): Promise<Response> {
      try {
        const principal = requireInjectedPrincipal(context);
        const result = await dependencies.reportService.listReporterReports(
          principal,
          pageFrom(validated<PageQuery>(context, "query")),
        );
        return context.json(result, 200);
      } catch (error) {
        return moderationErrorResponse(context, error);
      }
    },

    async listSocietyReports(context: Context<AppEnvironment>): Promise<Response> {
      try {
        const principal = requireInjectedPrincipal(context);
        const { societySlug } = validated<SocietyPathParams>(context, "param");
        const result = await dependencies.moderationService.listSocietyReports(
          principal,
          societySlug,
          pageFrom(validated<PageQuery>(context, "query")),
        );
        return context.json(result, 200);
      } catch (error) {
        return moderationErrorResponse(context, error);
      }
    },

    async listGlobalReports(context: Context<AppEnvironment>): Promise<Response> {
      try {
        const principal = requireInjectedPrincipal(context);
        const query = validated<GlobalReportsQuery>(context, "query");
        const result = await dependencies.moderationService.listAllReports(
          principal,
          pageFrom(query),
          query.status,
        );
        return context.json(result, 200);
      } catch (error) {
        return moderationErrorResponse(context, error);
      }
    },

    async getReport(context: Context<AppEnvironment>): Promise<Response> {
      try {
        const principal = requireInjectedPrincipal(context);
        const { reportId } = validated<ReportPathParams>(context, "param");
        const result = await dependencies.moderationService.getReport(principal, reportId);
        return context.json(result, 200);
      } catch (error) {
        return moderationErrorResponse(context, error);
      }
    },

    async claimReport(context: Context<AppEnvironment>): Promise<Response> {
      try {
        const principal = requireInjectedPrincipal(context);
        const { reportId } = validated<ReportPathParams>(context, "param");
        const result = await dependencies.moderationService.claimReport(principal, reportId);
        return context.json(result, 200);
      } catch (error) {
        return moderationErrorResponse(context, error);
      }
    },

    async resolveReport(context: Context<AppEnvironment>): Promise<Response> {
      try {
        const principal = requireInjectedPrincipal(context);
        const { reportId } = validated<ReportPathParams>(context, "param");
        const body = validated<ResolveReportBody>(context, "json");
        const command: ResolveReportCommand = {
          action: body.action,
          ...(body.resolutionNote === undefined ? {} : { resolutionNote: body.resolutionNote }),
          ...(body.suspendedUntil === undefined
            ? {}
            : { suspendedUntil: body.suspendedUntil === null ? null : new Date(body.suspendedUntil) }),
        };
        const result = await dependencies.moderationService.resolveReport(principal, reportId, command);
        return context.json(result, 200);
      } catch (error) {
        return moderationErrorResponse(context, error);
      }
    },

    async dismissReport(context: Context<AppEnvironment>): Promise<Response> {
      try {
        const principal = requireInjectedPrincipal(context);
        const { reportId } = validated<ReportPathParams>(context, "param");
        const body = validated<DismissReportBody>(context, "json");
        const command: DismissReportCommand = body.resolutionNote === undefined
          ? {}
          : { resolutionNote: body.resolutionNote };
        const result = await dependencies.moderationService.dismissReport(principal, reportId, command);
        return context.json(result, 200);
      } catch (error) {
        return moderationErrorResponse(context, error);
      }
    },

    async decideReport(context: Context<AppEnvironment>): Promise<Response> {
      try {
        const principal = requireInjectedPrincipal(context);
        const { reportId } = validated<ReportPathParams>(context, "param");
        const body = validated<ModerationDecisionBody>(context, "json");
        if (body.status === "dismissed") {
          return context.json(
            await dependencies.moderationService.dismissReport(principal, reportId, {
              ...(body.resolutionNote === undefined ? {} : { resolutionNote: body.resolutionNote }),
            }),
            200,
          );
        }
        const command: ResolveReportCommand = {
          action: body.action as ResolveReportCommand["action"],
          ...(body.resolutionNote === undefined ? {} : { resolutionNote: body.resolutionNote }),
          ...(body.suspendedUntil === undefined
            ? {}
            : { suspendedUntil: body.suspendedUntil === null ? null : new Date(body.suspendedUntil) }),
        };
        return context.json(
          await dependencies.moderationService.resolveReport(principal, reportId, command),
          200,
        );
      } catch (error) {
        return moderationErrorResponse(context, error);
      }
    },
  };
}

function pageFrom(query: PageQuery): { readonly limit: number; readonly cursor?: string } {
  return query.cursor === undefined
    ? { limit: query.limit ?? 20 }
    : { limit: query.limit ?? 20, cursor: query.cursor };
}
