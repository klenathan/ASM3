import { settingsSections, type SettingsSectionId } from "./settings-sections";

interface SettingsNavProps {
  activeId: SettingsSectionId;
  onSelect: (id: SettingsSectionId) => void;
}

const tabItem = (active: boolean) =>
  [
    "group relative flex shrink-0 items-center gap-2.5 rounded-none px-4 py-2.5 text-sm font-semibold transition-colors",
    active
      ? "bg-primary text-primary-foreground"
      : "text-muted-foreground hover:bg-surface-strong hover:text-foreground",
  ].join(" ");

/** Horizontal index-tab strip for portrait / small screens. */
export function SettingsTabStrip({ activeId, onSelect }: SettingsNavProps) {
  return (
    <nav
      aria-label="Settings sections"
      className="flex gap-1 overflow-x-auto border-b border-foreground/15 pb-px md:hidden"
    >
      {settingsSections.map(({ id, label, pending }) => {
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
export function SettingsRail({ activeId, onSelect }: SettingsNavProps) {
  return (
    <nav aria-label="Settings sections" className="hidden shrink-0 md:block">
      <ul className="flex flex-col gap-1">
        {settingsSections.map(({ id, label, icon: Icon, pending }) => {
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
