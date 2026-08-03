import { adminSections, type AdminSectionId } from "./admin-sections";

interface AdminNavProps {
  activeId: AdminSectionId;
  onSelect: (id: AdminSectionId) => void;
}

const tabItem = (active: boolean) =>
  [
    "group relative flex shrink-0 items-center gap-2.5 rounded-none px-4 py-2.5 text-sm font-semibold transition-colors",
    active
      ? "bg-primary text-primary-foreground"
      : "text-muted-foreground hover:bg-surface-strong hover:text-foreground",
  ].join(" ");

/** Horizontal index-tab strip for portrait / small screens. */
export function AdminTabStrip({ activeId, onSelect }: AdminNavProps) {
  return (
    <nav
      aria-label="Admin center sections"
      className="flex gap-1 overflow-x-auto border-b border-foreground/15 pb-px md:hidden"
    >
      {adminSections.map(({ id, label, pending }) => {
        const active = id === activeId;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(id)}
            aria-current={active ? "page" : undefined}
            className={tabItem(active)}
          >
            <span className="font-heading text-sm tracking-[0.02em] uppercase">{label}</span>
            {pending && (
              <span className="rounded-full border border-foreground/40 px-1.5 py-px text-[10px] font-medium tracking-[0.08em] uppercase opacity-70">
                soon
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}

/** Ruled index rail for desktop / landscape screens. */
export function AdminRail({ activeId, onSelect }: AdminNavProps) {
  return (
    <nav aria-label="Admin center sections" className="hidden shrink-0 md:block">
      <ul className="flex flex-col gap-1">
        {adminSections.map(({ id, label, icon: Icon, pending }) => {
          const active = id === activeId;
          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => onSelect(id)}
                aria-current={active ? "page" : undefined}
                className={[
                  tabItem(active),
                  "w-full justify-start",
                ].join(" ")}
              >
                <Icon aria-hidden="true" className="size-4" />
                <span className="font-heading text-sm tracking-[0.02em] uppercase">{label}</span>
                {pending && (
                  <span className="ml-auto rounded-full border border-foreground/40 px-1.5 py-px text-[10px] font-medium tracking-[0.08em] uppercase opacity-70">
                    soon
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
