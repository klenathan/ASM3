import type { Logger } from "pino";

import type { AppError } from "./shared/domain/errors";
import type { RequestPrincipal } from "./shared/presentation/request-principal";

export interface AppEnvironment {
  Variables: {
    requestId: string;
    logger: Logger;
    principal: RequestPrincipal | undefined;
    principalError: AppError | undefined;
  };
}
