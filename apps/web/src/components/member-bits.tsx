import { cn } from "@/lib/utils";
import {
  ROLE_LABEL,
  isStaff,
  type Member,
  type Role,
} from "@/lib/model";

export { isStaff };

export function RoleBadge({ role }: { role: Role }) {
  if (role === "STUDENT") return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-current px-1.5 py-px text-[0.65rem] font-semibold tracking-wide text-accent-foreground">
      <span className="size-1 rounded-full bg-current" />
      {ROLE_LABEL[role]}
    </span>
  );
}

export function MemberAvatar({
  member,
  size = "md",
  className,
}: {
  member: Member;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sizes = {
    sm: "size-6 text-[0.6rem]",
    md: "size-9 text-xs",
    lg: "size-12 text-sm",
  };
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center rounded-full font-display font-bold text-white ring-2 ring-background",
        sizes[size],
        className
      )}
      style={{
        background: `oklch(${0.45 + (member.avatarHue % 30) / 100} 0.14 ${member.avatarHue})`,
      }}
    >
      {member.initials}
    </span>
  );
}
