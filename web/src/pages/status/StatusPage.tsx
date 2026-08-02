import { type ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";

import { LogoMark } from "../../components/site/LogoMark";

interface StatusPageProps {
  icon: ReactNode;
  code: string;
  title: string;
  detail: string;
  action: string;
  onAction: () => void;
  secondary: string;
  onSecondary: () => void;
}

export function StatusPage({
  icon,
  code,
  title,
  detail,
  action,
  onAction,
  secondary,
  onSecondary,
}: StatusPageProps) {
  return (
    <div className="site-frame status-page">
      <header className="masthead site-header">
        <LogoMark />
        <span className="header-note">RMIT community forum</span>
      </header>
      <main className="status-main">
        <div className="status-mark">{icon}</div>
        <p className="issue-label">{code}</p>
        <h1>{title}</h1>
        <p>{detail}</p>
        <div className="status-actions">
          <button className="ink-button" type="button" onClick={onAction}>
            {action} <ArrowUpRight size={18} aria-hidden="true" />
          </button>
          <button className="text-button" type="button" onClick={onSecondary}>
            {secondary}
          </button>
        </div>
      </main>
    </div>
  );
}
