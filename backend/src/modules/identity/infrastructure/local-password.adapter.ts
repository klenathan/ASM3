import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

import { ApplicationError } from "../../../shared/domain/errors";
import type { PasswordAdapter, PasswordCredentialStore } from "../application/password.adapter";
import type { Database } from "../../../db/client";
import { authUsers } from "./auth.tables";
import { eq } from "drizzle-orm";

const KEY_LENGTH = 64;
const SCRYPT_COST = 16_384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const SCRYPT_MAX_MEMORY = 32 * 1024 * 1024;

export class InMemoryPasswordCredentialStore implements PasswordCredentialStore {
  private readonly hashes = new Map<string, string>();

  async get(userId: string): Promise<string | null> {
    return this.hashes.get(userId) ?? null;
  }

  async set(userId: string, passwordHash: string): Promise<void> {
    this.hashes.set(userId, passwordHash);
  }

  async delete(userId: string): Promise<void> {
    this.hashes.delete(userId);
  }
}

export class LocalPasswordAdapter implements PasswordAdapter {
  private readonly credentials: PasswordCredentialStore;

  constructor(credentials: PasswordCredentialStore = new InMemoryPasswordCredentialStore()) {
    this.credentials = credentials;
  }

  async hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16);
    const digest = await deriveKey(password, salt);
    return formatHash(salt, digest);
  }

  async setPassword(userId: string, password: string): Promise<void> {
    await this.credentials.set(userId, await this.hashPassword(password));
  }

  async verifyPassword(userId: string, password: string): Promise<boolean> {
    const encodedHash = await this.credentials.get(userId);
    if (encodedHash === null) return false;

    const parsed = parseHash(encodedHash);
    if (parsed === null) return false;

    const digest = await deriveKey(password, parsed.salt);
    return digest.length === parsed.digest.length && timingSafeEqual(digest, parsed.digest);
  }

  async removePassword(userId: string): Promise<void> {
    await this.credentials.delete(userId);
  }
}

export class DrizzlePasswordCredentialStore implements PasswordCredentialStore {
  private readonly database: Database;

  constructor(database: Database) {
    this.database = database;
  }

  async get(userId: string): Promise<string | null> {
    const rows = await this.database
      .select({ passwordHash: authUsers.passwordHash })
      .from(authUsers)
      .where(eq(authUsers.id, userId))
      .limit(1);
    return rows[0]?.passwordHash ?? null;
  }

  async set(userId: string, passwordHash: string): Promise<void> {
    await this.database
      .update(authUsers)
      .set({ passwordHash })
      .where(eq(authUsers.id, userId));
  }

  async delete(userId: string): Promise<void> {
    await this.database
      .update(authUsers)
      .set({ passwordHash: "" })
      .where(eq(authUsers.id, userId));
  }
}

async function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(
      password,
      salt,
      KEY_LENGTH,
      {
        N: SCRYPT_COST,
        r: SCRYPT_BLOCK_SIZE,
        p: SCRYPT_PARALLELIZATION,
        maxmem: SCRYPT_MAX_MEMORY,
      },
      (error, derivedKey) => {
        if (error !== null) {
          reject(error);
          return;
        }

        if (!Buffer.isBuffer(derivedKey)) {
          reject(new ApplicationError("PASSWORD_HASH_FAILED", "Password hashing failed"));
          return;
        }

        resolve(derivedKey);
      },
    );
  });
}

function formatHash(salt: Buffer, digest: Buffer): string {
  return [
    "scrypt",
    "1",
    String(SCRYPT_COST),
    String(SCRYPT_BLOCK_SIZE),
    String(SCRYPT_PARALLELIZATION),
    salt.toString("base64url"),
    digest.toString("base64url"),
  ].join("$");
}

function parseHash(value: string): { readonly salt: Buffer; readonly digest: Buffer } | null {
  const parts = value.split("$");
  if (parts.length !== 7 || parts[0] !== "scrypt" || parts[1] !== "1") return null;

  const cost = Number(parts[2]);
  const blockSize = Number(parts[3]);
  const parallelization = Number(parts[4]);
  if (
    cost !== SCRYPT_COST ||
    blockSize !== SCRYPT_BLOCK_SIZE ||
    parallelization !== SCRYPT_PARALLELIZATION
  ) {
    return null;
  }

  try {
    const salt = Buffer.from(parts[5] ?? "", "base64url");
    const digest = Buffer.from(parts[6] ?? "", "base64url");
    return salt.length === 16 && digest.length === KEY_LENGTH ? { salt, digest } : null;
  } catch {
    return null;
  }
}
