import { API_VERSION } from "../constants.js";

export const OPENAPI_PATH = "/api/v1/openapi.json";
export const OPENAPI_UI_PATH = "/docs";

export const OPENAPI_CONFIG = {
  openapi: "3.1.0" as const,
  info: {
    title: "RMIT Society API",
    version: API_VERSION,
    description: "Backend API for RMIT Society.",
  },
};
