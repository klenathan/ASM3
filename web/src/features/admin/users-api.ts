import { request } from "../../lib/http";

export type PlatformRole = "student" | "system_admin";
export type UserStatus = "active" | "suspended" | "deactivated";

export interface AdminUser {
  readonly userId: string;
  readonly email: string;
  readonly displayName: string;
  readonly bio: string | null;
  readonly avatarMediaId: string | null;
  readonly platformRole: PlatformRole;
  readonly status: UserStatus;
  readonly isPublic: boolean;
  readonly suspendedUntil: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AdminUserPage {
  readonly items: AdminUser[];
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
}

export interface ListUsersParams {
  readonly search?: string;
  readonly status?: UserStatus | "";
  readonly cursor?: string;
  readonly limit?: number;
}

export function fetchAdminUsers(params: ListUsersParams = {}): Promise<AdminUserPage> {
  const search = new URLSearchParams();
  if (params.search !== undefined && params.search.trim() !== "") {
    search.set("search", params.search.trim());
  }
  if (params.status !== undefined && params.status !== "") search.set("status", params.status);
  if (params.cursor !== undefined) search.set("cursor", params.cursor);
  if (params.limit !== undefined) search.set("limit", String(params.limit));
  const query = search.toString();
  return request<AdminUserPage>(`/api/v1/admin/users${query === "" ? "" : `?${query}`}`);
}

export function suspendUser(
  userId: string,
  suspendedUntil?: string | null,
): Promise<AdminUser> {
  return request<AdminUser>(`/api/v1/admin/users/${encodeURIComponent(userId)}/suspend`, {
    method: "POST",
    body: JSON.stringify({ suspendedUntil: suspendedUntil ?? null }),
  });
}

export function deactivateUser(userId: string): Promise<AdminUser> {
  return request<AdminUser>(`/api/v1/admin/users/${encodeURIComponent(userId)}/deactivate`, {
    method: "POST",
  });
}

export function activateUser(userId: string): Promise<AdminUser> {
  return request<AdminUser>(`/api/v1/admin/users/${encodeURIComponent(userId)}/activate`, {
    method: "POST",
  });
}

export function setUserRole(userId: string, platformRole: PlatformRole): Promise<AdminUser> {
  return request<AdminUser>(`/api/v1/admin/users/${encodeURIComponent(userId)}/role`, {
    method: "PATCH",
    body: JSON.stringify({ platformRole }),
  });
}
