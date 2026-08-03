/**
 * Reads a platform configuration value for a given key.
 *
 * Returns `null` when no row is configured for the key. Consumers are expected
 * to fall back to their own defaults, or treat an absent/empty configuration as
 * intentionally locked down (fail closed).
 */
export type ConfigReader = (key: string) => Promise<string | null>;
