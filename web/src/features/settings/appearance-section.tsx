import { useTheme } from "next-themes";
import { Check } from "lucide-react";

type ThemeValue = "light" | "dark" | "system";

const themeOptions: { value: ThemeValue; label: string; hint: string }[] = [
  { value: "light", label: "Light", hint: "Bright, cool campus stock" },
  { value: "dark", label: "Dark", hint: "Deep-ink night reading" },
  { value: "system", label: "System", hint: "Follow this device" },
];

export function AppearanceSection() {
  const { theme, setTheme } = useTheme();

  return (
    <section aria-labelledby="appearance-heading">
      <h2
        id="appearance-heading"
        className="font-heading text-2xl font-semibold tracking-[0.01em] text-balance uppercase"
      >
        Appearance
      </h2>
      <p className="mt-2 max-w-lg leading-7 text-muted-foreground">
        Choose how RMIT Society looks on this device.
      </p>

      <div
        role="radiogroup"
        aria-label="Theme"
        className="mt-6 grid max-w-xl grid-cols-1 gap-2 sm:grid-cols-3"
      >
        {themeOptions.map((option) => {
          const active = theme === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setTheme(option.value)}
              className={[
                "group flex flex-col items-start gap-3 rounded-none border px-4 py-4 text-left transition-colors",
                active
                  ? "border-primary bg-primary/10"
                  : "border-foreground/20 hover:border-foreground/40",
              ].join(" ")}
            >
              <span className="flex w-full items-center justify-between">
                <span
                  className={[
                    "font-heading text-base tracking-[0.02em] uppercase",
                    active ? "text-primary" : "text-foreground",
                  ].join(" ")}
                >
                  {option.label}
                </span>
                {active && (
                  <span
                    aria-hidden="true"
                    className="flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground"
                  >
                    <Check className="size-3.5" strokeWidth={3} />
                  </span>
                )}
              </span>
              <span className="text-xs leading-5 text-muted-foreground">{option.hint}</span>
            </button>
          );
        })}
      </div>

      <p className="mt-5 text-xs leading-5 text-muted-foreground">
        Your choice is saved on this device in your browser. It won’t follow you to another
        computer.
      </p>
    </section>
  );
}
