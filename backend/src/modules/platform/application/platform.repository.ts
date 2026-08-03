import type { PlatformConfigRecord } from "../domain/platform";

export interface UpsertPlatformConfigInput {
  readonly key: string;
  readonly value: string;
  readonly updatedAt: Date;
}

export interface PlatformConfigRepository {
  findConfig(key: string): Promise<PlatformConfigRecord | null>;
  listConfigs(): Promise<readonly PlatformConfigRecord[]>;
  upsertConfig(input: UpsertPlatformConfigInput): Promise<PlatformConfigRecord>;
}
