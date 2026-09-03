import { Link } from "react-router-dom";

interface LogoMarkProps {
  readonly to?: string;
}

export function LogoMark({ to = "/" }: LogoMarkProps) {
  return (
    <Link
      to={to}
      aria-label="RMIT Society home"
      className="group inline-flex items-center gap-2.5 rounded-none text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background"
    >
      <span
        aria-hidden="true"
        className="flex size-8 items-center justify-center bg-primary font-heading text-[1.35rem] leading-none font-bold tracking-[-0.06em] text-primary-foreground transition-colors group-hover:bg-foreground group-hover:text-background"
      >
        RS
      </span>
      <span className="hidden font-heading text-2xl leading-none font-bold tracking-[-0.025em] uppercase sm:inline">
        <span>RMIT</span>{" "}
        <span className="text-primary transition-colors group-hover:text-foreground">
          Society
        </span>
      </span>
    </Link>
  );
}
