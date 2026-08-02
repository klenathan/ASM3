import { Link } from "react-router-dom";

interface LogoMarkProps {
  readonly to?: string;
}

export function LogoMark({ to = "/" }: LogoMarkProps) {
  return (
    <Link
      to={to}
      aria-label="RMIT Society home"
      className="rounded-none font-heading text-xl font-semibold tracking-[0.01em] text-foreground uppercase transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background"
    >
      <span className="text-primary">RMIT</span> Society
    </Link>
  );
}
