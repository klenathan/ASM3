import { Bell, Palette, Shield, UserRound, type LucideIcon } from "lucide-react";

export type SettingsSectionId =
  | "appearance"
  | "account"
  | "notifications"
  | "moderation";

export interface SettingsSection {
  id: SettingsSectionId;
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

export const settingsSections: SettingsSection[] = [
  {
    id: "appearance",
    label: "Appearance",
    heading: "Appearance",
    icon: Palette,
    blurb: "Choose how RMIT Society looks on this device.",
    pending: false,
  },
  {
    id: "account",
    label: "Account",
    heading: "Account",
    icon: UserRound,
    blurb: "Sign-in details and profile defaults.",
    pending: true,
  },
  {
    id: "notifications",
    label: "Notifications",
    heading: "Notifications",
    icon: Bell,
    blurb: "Choose which updates you hear about.",
    pending: true,
  },
  {
    id: "moderation",
    label: "Moderation",
    heading: "Moderation",
    icon: Shield,
    blurb: "Tools for the societies you help run.",
    pending: true,
  },
];

export function getSection(id: SettingsSectionId): SettingsSection {
  return settingsSections.find((section) => section.id === id) ?? settingsSections[0];
}
