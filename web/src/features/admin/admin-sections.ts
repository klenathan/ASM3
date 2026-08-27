import {
  Activity,
  BarChart3,
  History,
  ScanSearch,
  ShieldCheck,
  SlidersHorizontal,
  UserCog,
  type LucideIcon,
} from "lucide-react";

export type AdminSectionId =
  | "users"
  | "moderation"
  | "content"
  | "health"
  | "audit"
  | "config"
  | "analytics";

export interface AdminSection {
  id: AdminSectionId;
  /** Short rail/tab label. */
  label: string;
  /** Uppercase display heading for the section. */
  heading: string;
  icon: LucideIcon;
  /** One-line description shown under the heading. */
  blurb: string;
  /** True when the section is reserved for a later release. */
  pending: boolean;
}

export const adminSections: AdminSection[] = [
  {
    id: "users",
    label: "Users & roles",
    heading: "Users & roles",
    icon: UserCog,
    blurb: "Manage accounts, status, and platform roles.",
    pending: false,
  },
  {
    id: "moderation",
    label: "Moderation",
    heading: "Moderation",
    icon: ShieldCheck,
    blurb: "Global report queue and resolution history.",
    pending: false,
  },
  {
    id: "content",
    label: "Content review",
    heading: "Content review",
    icon: ScanSearch,
    blurb: "Threads flagged by the automated content check.",
    pending: false,
  },
  {
    id: "health",
    label: "Status",
    heading: "System health",
    icon: Activity,
    blurb: "Platform health and connectivity at a glance.",
    pending: false,
  },
  {
    id: "audit",
    label: "Audit trail",
    heading: "Audit & event trail",
    icon: History,
    blurb: "Platform events captured from the event pipeline.",
    pending: false,
  },
  {
    id: "config",
    label: "Config",
    heading: "Platform config",
    icon: SlidersHorizontal,
    blurb: "Manage registration policy and platform keys.",
    pending: false,
  },
  {
    id: "analytics",
    label: "Analytics",
    heading: "Analytics",
    icon: BarChart3,
    blurb: "Usage metrics computed nightly via the EMR pipeline.",
    pending: false,
  },
];

export function getSection(id: AdminSectionId): AdminSection {
  return adminSections.find((section) => section.id === id) ?? adminSections[0];
}
