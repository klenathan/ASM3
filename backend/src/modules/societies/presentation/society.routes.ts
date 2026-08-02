import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";

import type { AppEnvironment } from "../../../app-types.js";
import type { MembershipService } from "../application/membership.service.js";
import type { SocietyService } from "../application/society.service.js";
import { createMembershipController } from "./membership.controller.js";
import { createSocietyRulesController } from "./society-rules.controller.js";
import { createSocietyController } from "./society.controller.js";
import {
  addModeratorRequestSchema,
  createRuleRequestSchema,
  createSocietyRequestSchema,
  errorSchema,
  membershipResponseSchema,
  membershipSchema,
  ruleSchema,
  societyDiscoveryQuerySchema,
  societyPageSchema,
  societyRulesSchema,
  societySchema,
  updateRuleRequestSchema,
} from "./society.schemas.js";

const societyIdParams = z.object({
  societyId: z.string().uuid(),
});

const ruleParams = z.object({
  societyId: z.string().uuid(),
  ruleId: z.string().uuid(),
});

const moderatorParams = z.object({
  societyId: z.string().uuid(),
  userId: z.string().uuid(),
});

const discoverRoute = createRoute({
  method: "get",
  path: "/api/v1/societies",
  tags: ["Societies"],
  summary: "Discover active societies",
  request: { query: societyDiscoveryQuerySchema },
  responses: {
    200: { description: "Society page", content: { "application/json": { schema: societyPageSchema } } },
    400: { description: "Invalid cursor or query", content: { "application/json": { schema: errorSchema } } },
  },
});

const createSocietyRoute = createRoute({
  method: "post",
  path: "/api/v1/societies",
  tags: ["Societies"],
  summary: "Create a society",
  request: { body: { content: { "application/json": { schema: createSocietyRequestSchema } } } },
  responses: {
    201: { description: "Society created", content: { "application/json": { schema: societySchema } } },
    400: { description: "Invalid society input", content: { "application/json": { schema: errorSchema } } },
    401: { description: "Authentication is required", content: { "application/json": { schema: errorSchema } } },
    403: { description: "System-admin access is required", content: { "application/json": { schema: errorSchema } } },
    409: { description: "Society slug already exists", content: { "application/json": { schema: errorSchema } } },
  },
});

const getSocietyRoute = createRoute({
  method: "get",
  path: "/api/v1/societies/{societyId}",
  tags: ["Societies"],
  summary: "Get a society",
  request: { params: societyIdParams },
  responses: {
    200: { description: "Society", content: { "application/json": { schema: societySchema } } },
    404: { description: "Society was not found", content: { "application/json": { schema: errorSchema } } },
  },
});

const getMembershipRoute = createRoute({
  method: "get",
  path: "/api/v1/societies/{societyId}/membership",
  tags: ["Society membership"],
  summary: "Get the current user's membership",
  request: { params: societyIdParams },
  responses: {
    200: { description: "Current membership", content: { "application/json": { schema: membershipResponseSchema } } },
    401: { description: "Authentication is required", content: { "application/json": { schema: errorSchema } } },
    404: { description: "Society was not found", content: { "application/json": { schema: errorSchema } } },
  },
});

const joinRoute = createRoute({
  method: "post",
  path: "/api/v1/societies/{societyId}/membership",
  tags: ["Society membership"],
  summary: "Join a society",
  request: { params: societyIdParams },
  responses: {
    200: { description: "Active membership", content: { "application/json": { schema: membershipSchema } } },
    401: { description: "Authentication is required", content: { "application/json": { schema: errorSchema } } },
    403: { description: "Membership is not allowed", content: { "application/json": { schema: errorSchema } } },
    404: { description: "Society was not found", content: { "application/json": { schema: errorSchema } } },
  },
});

const leaveRoute = createRoute({
  method: "delete",
  path: "/api/v1/societies/{societyId}/membership",
  tags: ["Society membership"],
  summary: "Leave a society",
  request: { params: societyIdParams },
  responses: {
    204: { description: "Membership left" },
    401: { description: "Authentication is required", content: { "application/json": { schema: errorSchema } } },
    403: { description: "Membership cannot be left", content: { "application/json": { schema: errorSchema } } },
    404: { description: "Active membership was not found", content: { "application/json": { schema: errorSchema } } },
    409: { description: "The society must retain a moderator", content: { "application/json": { schema: errorSchema } } },
  },
});

const addModeratorRoute = createRoute({
  method: "post",
  path: "/api/v1/societies/{societyId}/membership/moderators",
  tags: ["Society membership"],
  summary: "Add a society moderator",
  request: {
    params: societyIdParams,
    body: { content: { "application/json": { schema: addModeratorRequestSchema } } },
  },
  responses: {
    200: { description: "Moderator membership", content: { "application/json": { schema: membershipSchema } } },
    400: { description: "Invalid moderator input", content: { "application/json": { schema: errorSchema } } },
    401: { description: "Authentication is required", content: { "application/json": { schema: errorSchema } } },
    403: { description: "Society moderator access is required", content: { "application/json": { schema: errorSchema } } },
    404: { description: "Society was not found", content: { "application/json": { schema: errorSchema } } },
  },
});

const removeModeratorRoute = createRoute({
  method: "delete",
  path: "/api/v1/societies/{societyId}/membership/moderators/{userId}",
  tags: ["Society membership"],
  summary: "Remove a society moderator",
  request: { params: moderatorParams },
  responses: {
    200: { description: "Member membership", content: { "application/json": { schema: membershipSchema } } },
    401: { description: "Authentication is required", content: { "application/json": { schema: errorSchema } } },
    403: { description: "Society moderator access is required", content: { "application/json": { schema: errorSchema } } },
    404: { description: "Moderator was not found", content: { "application/json": { schema: errorSchema } } },
    409: { description: "The society must retain a moderator", content: { "application/json": { schema: errorSchema } } },
  },
});

const listRulesRoute = createRoute({
  method: "get",
  path: "/api/v1/societies/{societyId}/rules",
  tags: ["Society rules"],
  summary: "List society rules",
  request: { params: societyIdParams },
  responses: {
    200: { description: "Society rules", content: { "application/json": { schema: societyRulesSchema } } },
    404: { description: "Society was not found", content: { "application/json": { schema: errorSchema } } },
  },
});

const createRuleRoute = createRoute({
  method: "post",
  path: "/api/v1/societies/{societyId}/rules",
  tags: ["Society rules"],
  summary: "Create a society rule",
  request: {
    params: societyIdParams,
    body: { content: { "application/json": { schema: createRuleRequestSchema } } },
  },
  responses: {
    201: { description: "Society rule created", content: { "application/json": { schema: ruleSchema } } },
    400: { description: "Invalid rule input", content: { "application/json": { schema: errorSchema } } },
    401: { description: "Authentication is required", content: { "application/json": { schema: errorSchema } } },
    403: { description: "Society moderator access is required", content: { "application/json": { schema: errorSchema } } },
    404: { description: "Society was not found", content: { "application/json": { schema: errorSchema } } },
    409: { description: "Rule position already exists", content: { "application/json": { schema: errorSchema } } },
  },
});

const getRuleRoute = createRoute({
  method: "get",
  path: "/api/v1/societies/{societyId}/rules/{ruleId}",
  tags: ["Society rules"],
  summary: "Get a society rule",
  request: { params: ruleParams },
  responses: {
    200: { description: "Society rule", content: { "application/json": { schema: ruleSchema } } },
    404: { description: "Rule was not found", content: { "application/json": { schema: errorSchema } } },
  },
});

const updateRuleRoute = createRoute({
  method: "patch",
  path: "/api/v1/societies/{societyId}/rules/{ruleId}",
  tags: ["Society rules"],
  summary: "Update a society rule",
  request: {
    params: ruleParams,
    body: { content: { "application/json": { schema: updateRuleRequestSchema } } },
  },
  responses: {
    200: { description: "Updated society rule", content: { "application/json": { schema: ruleSchema } } },
    400: { description: "Invalid rule input", content: { "application/json": { schema: errorSchema } } },
    401: { description: "Authentication is required", content: { "application/json": { schema: errorSchema } } },
    403: { description: "Society moderator access is required", content: { "application/json": { schema: errorSchema } } },
    404: { description: "Rule was not found", content: { "application/json": { schema: errorSchema } } },
    409: { description: "Rule position already exists", content: { "application/json": { schema: errorSchema } } },
  },
});

const deleteRuleRoute = createRoute({
  method: "delete",
  path: "/api/v1/societies/{societyId}/rules/{ruleId}",
  tags: ["Society rules"],
  summary: "Delete a society rule",
  request: { params: ruleParams },
  responses: {
    204: { description: "Society rule deleted" },
    401: { description: "Authentication is required", content: { "application/json": { schema: errorSchema } } },
    403: { description: "Society moderator access is required", content: { "application/json": { schema: errorSchema } } },
    404: { description: "Rule was not found", content: { "application/json": { schema: errorSchema } } },
  },
});

export interface SocietyRouteDependencies {
  readonly societyService: SocietyService;
  readonly membershipService: MembershipService;
}

export function registerSocietyRoutes(
  app: OpenAPIHono<AppEnvironment>,
  dependencies: SocietyRouteDependencies,
): void {
  const societyController = createSocietyController({ societyService: dependencies.societyService });
  const membershipController = createMembershipController({
    membershipService: dependencies.membershipService,
  });
  const rulesController = createSocietyRulesController({
    societyService: dependencies.societyService,
  });

  app.openapi(discoverRoute, (context) => societyController.discover(context) as never);
  app.openapi(createSocietyRoute, (context) => societyController.create(context) as never);
  app.openapi(getSocietyRoute, (context) => societyController.get(context) as never);
  app.openapi(getMembershipRoute, (context) => membershipController.get(context) as never);
  app.openapi(joinRoute, (context) => membershipController.join(context) as never);
  app.openapi(leaveRoute, (context) => membershipController.leave(context) as never);
  app.openapi(addModeratorRoute, (context) => membershipController.addModerator(context) as never);
  app.openapi(removeModeratorRoute, (context) => membershipController.removeModerator(context) as never);
  app.openapi(listRulesRoute, (context) => rulesController.list(context) as never);
  app.openapi(createRuleRoute, (context) => rulesController.create(context) as never);
  app.openapi(getRuleRoute, (context) => rulesController.get(context) as never);
  app.openapi(updateRuleRoute, (context) => rulesController.update(context) as never);
  app.openapi(deleteRuleRoute, (context) => rulesController.remove(context) as never);
}
