import type { Logger } from "pino";

export interface AppEnvironment {
  Variables: {
    requestId: string;
    logger: Logger;
  };
}
