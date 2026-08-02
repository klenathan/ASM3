import { createHash, randomBytes } from "node:crypto";

import type {
  IssuedSessionToken,
  SessionTokenAdapter,
} from "../application/session.adapter";

export class OpaqueSessionAdapter implements SessionTokenAdapter {
  issue(): IssuedSessionToken {
    const token = randomBytes(32).toString("base64url");
    return { token, hash: this.hash(token) };
  }

  hash(token: string): string {
    // The existing auth_sessions table has no token_hash column; its UUID id stores this digest.
    const digest = createHash("sha256").update(token, "utf8").digest("hex").slice(0, 32);
    return [
      digest.slice(0, 8),
      digest.slice(8, 12),
      digest.slice(12, 16),
      digest.slice(16, 20),
      digest.slice(20, 32),
    ].join("-");
  }
}
