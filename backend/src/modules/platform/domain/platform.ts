export type PlatformConfigKey = "allowed_email_domains";

export interface PlatformConfigRecord {
  readonly key: string;
  readonly value: string;
  readonly updatedAt: Date;
}

export const DEFAULT_PLATFORM_CONFIG_KEYS: readonly PlatformConfigKey[] = [
  "allowed_email_domains",
];

export const DEFAULT_ALLOWED_EMAIL_DOMAINS =
  "rmit.edu.au,rmit.edu.vn,rmit.edu.eu,rmit.eu";

export function defaultForConfigKey(key: string): string | null {
  if (key === "allowed_email_domains") return DEFAULT_ALLOWED_EMAIL_DOMAINS;
  return null;
}
