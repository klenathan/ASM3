export interface IssuedSessionToken {
  readonly token: string;
  readonly hash: string;
}

export interface SessionTokenAdapter {
  issue(): IssuedSessionToken;
  hash(token: string): string;
}
