import type { ContentState, Role, Society, User } from "./api/types";

export type { ContentState, Role };

export interface Member {
  id: string;
  name: string;
  handle: string;
  initials: string;
  avatarHue: number;
  role: Role;
  school: string;
  bio: string;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function hueOf(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++)
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return hash % 360;
}

const SCHOOL_LABEL: Record<string, string> = {
  rmit: "RMIT University",
};

export function schoolName(institutionId: string): string {
  return SCHOOL_LABEL[institutionId] ?? institutionId.toUpperCase();
}

export function toMember(user: User): Member {
  const name = user.display_name || user.handle || "Member";
  return {
    id: user.user_id,
    name,
    handle: user.handle || user.user_id,
    initials: initialsOf(name),
    avatarHue: hueOf(user.user_id || user.handle),
    role: user.role,
    school: schoolName(user.institution_id),
    bio: user.bio,
  };
}

export const ROLE_LABEL: Record<Role, string> = {
  STUDENT: "Student",
  STAFF: "Verified Staff",
  MODERATOR: "Moderator",
  RMIT_ADMIN: "School Admin",
  PLATFORM_ADMIN: "Platform Admin",
};

export function isStaff(role: Role): boolean {
  return role !== "STUDENT";
}

export const STATE_LABEL: Record<
  ContentState,
  { abbreviated: string; full: string }
> = {
  PENDING: { abbreviated: "PENDING · CHECKING", full: "Pending review" },
  APPROVED: { abbreviated: "APPROVED", full: "Approved" },
  FLAGGED: { abbreviated: "FLAGGED · IN REVIEW", full: "In review" },
  REJECTED: { abbreviated: "REJECTED", full: "Rejected" },
  FAILED: { abbreviated: "FAILED · RETRYING", full: "Processing issue" },
};

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `${Math.max(mins, 1)}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.round(hrs / 24);
  return `${days}d`;
}

export interface SpaceView {
  id: string;
  slug: string;
  name: string;
  description: string;
  tagline: string;
  members: number;
  curie: string;
  hue: number;
}

function curieOf(slug: string): string {
  const cleaned = slug.replace(/[^a-z0-9]/gi, "").toUpperCase();
  if (cleaned.length <= 4) return cleaned || "SPACE";
  return cleaned.slice(0, 4);
}

export function toSpace(society: Society): SpaceView {
  return {
    id: society.society_id,
    slug: society.slug,
    name: society.name,
    description: society.description,
    tagline: society.description.split(/[.\n]/)[0] || society.name,
    members: society.member_count,
    curie: curieOf(society.slug),
    hue: hueOf(society.slug),
  };
}
