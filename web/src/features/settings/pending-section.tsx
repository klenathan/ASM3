import type { SettingsSection } from "./settings-sections";

export function PendingSection({ section }: { section: SettingsSection }) {
  return (
    <section aria-labelledby={`${section.id}-heading`}>
      <h2
        id={`${section.id}-heading`}
        className="font-heading text-2xl font-semibold tracking-[0.01em] text-balance uppercase"
      >
        {section.heading}
      </h2>
      <p className="mt-2 max-w-lg leading-7 text-muted-foreground">{section.blurb}</p>

      <div className="mt-6 border border-dashed border-foreground/25 px-5 py-10">
        <p className="max-w-md leading-7 text-muted-foreground">
          This section is on the plan but isn’t built yet. Check back once it ships.
        </p>
      </div>
    </section>
  );
}
