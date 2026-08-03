import { useState } from "react";

import { AppearanceSection } from "../../features/settings/appearance-section";
import { PendingSection } from "../../features/settings/pending-section";
import {
  SettingsRail,
  SettingsTabStrip,
} from "../../features/settings/settings-nav";
import {
  getSection,
  type SettingsSectionId,
} from "../../features/settings/settings-sections";

export function SettingsPage() {
  const [activeId, setActiveId] = useState<SettingsSectionId>("appearance");
  const section = getSection(activeId);

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-6 lg:px-10">
      <header className="pb-6">
        <h1 className="font-heading text-[clamp(2.25rem,4.5vw,3.25rem)] leading-none font-semibold tracking-[-0.01em] text-balance uppercase">
          Settings
        </h1>
        <p className="mt-3 max-w-xl leading-7 text-muted-foreground">
          Make RMIT Society fit the way you read and work.
        </p>
      </header>

      <SettingsTabStrip activeId={activeId} onSelect={setActiveId} />

      <div className="mt-6 flex flex-col gap-8 md:mt-10 md:flex-row md:gap-12">
        <SettingsRail activeId={activeId} onSelect={setActiveId} />

        <div className="min-w-0 flex-1">
          <div className="border-t-2 border-foreground pt-8">
            {section.pending ? (
              <PendingSection section={section} />
            ) : (
              <AppearanceSection />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
