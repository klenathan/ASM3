import { LogoMark } from "../../components/site/LogoMark";

export function LoadingPage({ label }: { label: string }) {
  return (
    <div className="site-frame loading-page">
      <header className="masthead site-header">
        <LogoMark />
        <span className="header-note">RMIT community forum</span>
      </header>
      <main className="loading-main" aria-live="polite">
        <span className="loading-line" />
        <p>{label}…</p>
      </main>
    </div>
  );
}
