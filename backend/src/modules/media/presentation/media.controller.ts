import type { Context } from "hono";

import type { AppEnvironment } from "../../../app-types";
import { errorResponse } from "../../../shared/presentation/error-response";
import type { MediaService } from "../application/media.service";
import type {
  AttachMediaCommand,
  CompleteUploadCommand,
  MediaUrlDto,
  RequestUploadCommand,
} from "../application/media.dto";
import { getPrincipal, validated } from "./media.http.helpers";

export interface MediaControllerDependencies {
  readonly mediaService: MediaService;
}

export function createMediaController(dependencies: MediaControllerDependencies) {
  return {
    async requestUpload(context: Context<AppEnvironment>): Promise<Response> {
      try {
        const result = await dependencies.mediaService.requestUpload(
          getPrincipal(context),
          validated<RequestUploadCommand>(context, "json"),
        );
        return context.json(result, 201);
      } catch (error) {
        return errorResponse(context, error);
      }
    },

    async completeUpload(context: Context<AppEnvironment>): Promise<Response> {
      try {
        const { mediaId } = validated<{ mediaId: string }>(context, "param");
        const result = await dependencies.mediaService.completeUpload(
          getPrincipal(context),
          mediaId,
          validated<CompleteUploadCommand>(context, "json"),
        );
        return context.json(result, 200);
      } catch (error) {
        return errorResponse(context, error);
      }
    },

    async deleteUpload(context: Context<AppEnvironment>): Promise<Response> {
      try {
        const { mediaId } = validated<{ mediaId: string }>(context, "param");
        await dependencies.mediaService.deleteUpload(getPrincipal(context), mediaId);
        return context.body(null, 204);
      } catch (error) {
        return errorResponse(context, error);
      }
    },

    async attachToThread(context: Context<AppEnvironment>): Promise<Response> {
      try {
        const result = await dependencies.mediaService.attachToThread(
          getPrincipal(context),
          validated<AttachMediaCommand>(context, "json"),
        );
        return context.json(result, 200);
      } catch (error) {
        return errorResponse(context, error);
      }
    },

    async getMediaUrl(context: Context<AppEnvironment>): Promise<Response> {
      try {
        const { mediaId } = validated<{ mediaId: string }>(context, "param");
        const result = await dependencies.mediaService.resolveMediaUrl(mediaId);
        return context.json(result satisfies MediaUrlDto, 200);
      } catch (error) {
        return errorResponse(context, error);
      }
    },
  };
}
