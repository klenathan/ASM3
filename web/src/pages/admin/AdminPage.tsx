import { useState } from "react";

import { AdminRail, AdminTabStrip } from "../../features/admin/admin-nav";
import {
  getSection,
  type AdminSectionId,
} from "../../features/admin/admin-sections";
import { PendingSection } from "../../features/admin/pending-section";

import { UsersSection } from "../../features/admin/users-section";
import { ModerationSection } from "../../features/admin/moderation-section";
import { ContentReviewSection } from "../../features/admin/content-review-section";
import { HealthSection } from "../../features/admin/health-section";
import { AuditSection } from "../../features/admin/audit-section";
import { ConfigSection } from "../../features/admin/config-section";

export function AdminPage() {
  const [activeId, setActiveId] = useState<AdminSectionId>("users");
  const section = getSection(activeId);

  const sectionContent: Record<AdminSectionId, () => React.ReactNode> = {
    users: () => <UsersSection />,
    moderation: () => <ModerationSection />,
    content: () => <ContentReviewSection />,
    health: () => <HealthSection />,
    audit: () => <AuditSection />,
    config: () => <ConfigSection />,
    analytics: () => <PendingSection section={section} />,
  };

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-6 lg:px-10">
      <header className="pb-6">
        <h1 className="font-heading text-[clamp(2.25rem,4.5vw,3.25rem)] leading-none font-semibold tracking-[-0.01em] text-balance uppercase">
          Admin center
        </h1>
        <p className="mt-3 max-w-xl leading-7 text-muted-foreground">
          Run the platform-wide controls for RMIT Society.
        </p>
      </header>

      <AdminTabStrip activeId={activeId} onSelect={setActiveId} />

      <div className="mt-6 flex flex-col gap-8 md:mt-10 md:flex-row md:gap-12">
        <AdminRail activeId={activeId} onSelect={setActiveId} />

        <div className="min-w-0 flex-1">
          <div className="border-t-2 border-foreground pt-8">
            {section.pending ? (
              <PendingSection section={section} />
            ) : (
              sectionContent[activeId]()
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
