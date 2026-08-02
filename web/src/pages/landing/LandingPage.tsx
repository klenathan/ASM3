import { ArrowRight, ArrowUpRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { LogoMark } from "../../components/site/LogoMark";
import { useAuth } from "../../features/auth/auth-context";

export function LandingPage() {
  const navigate = useNavigate();
  const { status } = useAuth();

  return (
    <div className="site-frame landing-page">
      <header className="masthead site-header">
        <LogoMark />
        <div className="header-note">
          RMIT community forum <span aria-hidden="true">/</span> 2026
        </div>
      </header>

      <main className="landing-main">
        <section className="landing-intro" aria-labelledby="landing-title">
          <p className="issue-label">Issue 01 · Find your people</p>
          <h1 id="landing-title">Make room for better conversations.</h1>
          <p className="landing-deck">
            RMIT Society is a shared reading table for student communities —
            discover societies, start threads, and keep campus conversation
            moving.
          </p>
          <div className="landing-actions">
            <button
              className="ink-button"
              onClick={() => navigate("/sign-in")}
              type="button"
            >
              Sign in to RMIT Society{" "}
              <ArrowUpRight size={18} strokeWidth={1.8} aria-hidden="true" />
            </button>
            {status === "loading" && (
              <span className="quiet-note">Checking session…</span>
            )}
          </div>
        </section>

        <aside className="landing-index" aria-label="What RMIT Society is for">
          <div className="index-topline">
            <span>RMIT / SOCIETY</span>
            <span>INDEX</span>
          </div>
          <div className="index-list">
            <div className="index-row">
              <span>01</span>
              <strong>Find a society</strong>
              <ArrowRight size={16} aria-hidden="true" />
            </div>
            <div className="index-row">
              <span>02</span>
              <strong>Join the thread</strong>
              <ArrowRight size={16} aria-hidden="true" />
            </div>
            <div className="index-row">
              <span>03</span>
              <strong>Keep it accountable</strong>
              <ArrowRight size={16} aria-hidden="true" />
            </div>
          </div>
          <p className="index-footnote">
            For approved RMIT identities across the AU, VN, and EU community.
          </p>
        </aside>
      </main>

      <footer className="site-footer">
        <span>Unofficial student community space</span>
        <span>Use your approved RMIT email to enter</span>
      </footer>
    </div>
  );
}
