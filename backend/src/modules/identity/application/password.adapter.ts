export interface PasswordCredentialStore {
  get(userId: string): Promise<string | null>;
  set(userId: string, passwordHash: string): Promise<void>;
  delete(userId: string): Promise<void>;
}

export interface PasswordAdapter {
  setPassword(userId: string, password: string): Promise<void>;
  verifyPassword(userId: string, password: string): Promise<boolean>;
  removePassword(userId: string): Promise<void>;
}
