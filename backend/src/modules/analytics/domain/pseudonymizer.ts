import { createHmac } from "node:crypto";

import { DomainError } from "../../../shared/domain/errors";

/**
 * Pseudonymization contract: actor identities leave RDS only as
 * lowercase HMAC-SHA256 digests keyed by ANALYTICS_PSEUDONYM_KEY.
 * The key is injected so tests can use a deterministic value.
 */

export interface ActorPseudonym {
  readonly pseudonym: string;
  readonly keyVersion: string;
}

export interface ActionEventPseudonymizer {
  pseudonymize(actorUserId: string): ActorPseudonym;
}

export const MIN_PSEUDONYM_KEY_BYTES = 32;

export function createHmacPseudonymizer(
  key: Uint8Array,
  keyVersion: string,
): ActionEventPseudonymizer {
  if (key.length < MIN_PSEUDONYM_KEY_BYTES) {
    throw new PseudonymKeyInvalidError(
      `must contain at least ${MIN_PSEUDONYM_KEY_BYTES} bytes`,
    );
  }
  if (keyVersion.trim().length === 0) {
    throw new PseudonymKeyInvalidError("version must be a non-empty string");
  }

  return {
    pseudonymize(actorUserId: string): ActorPseudonym {
      const digest = createHmac("sha256", key)
        .update(`user:${actorUserId}`, "utf8")
        .digest("hex");

      return { pseudonym: digest, keyVersion };
    },
  };
}

/** Accepts hex- or base64-encoded keys and enforces the 32-byte floor. */
export function decodePseudonymKey(encodedKey: string): Uint8Array {
  const trimmed = encodedKey.trim();

  if (/^[0-9a-fA-F]+$/.test(trimmed) && trimmed.length % 2 === 0) {
    const key = Buffer.from(trimmed, "hex");
    if (key.length < MIN_PSEUDONYM_KEY_BYTES) {
      throw new PseudonymKeyInvalidError(
        `must contain at least ${MIN_PSEUDONYM_KEY_BYTES} bytes`,
      );
    }
    return key;
  }

  const key = Buffer.from(trimmed, "base64");
  if (key.length === 0) {
    throw new PseudonymKeyInvalidError("must be hex- or base64-encoded");
  }
  if (key.length < MIN_PSEUDONYM_KEY_BYTES) {
    throw new PseudonymKeyInvalidError(
      `must contain at least ${MIN_PSEUDONYM_KEY_BYTES} bytes`,
    );
  }
  return key;
}

export class PseudonymKeyInvalidError extends DomainError {
  constructor(reason: string) {
    super("ANALYTICS_PSEUDONYM_KEY_INVALID", `Invalid pseudonym key: ${reason}`);
  }
}
