import { useState } from "react";
import { ArrowRight, BookOpen, LogOut, Menu } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { LogoMark } from "../../components/site/LogoMark";
import { useAuth } from "../../features/auth/auth-context";

export function ForumPage() {
  const { user, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();

  async function handleSignOut() {
    await signOut();
    navigate("/", { replace: true });
  }

  return (
    <div className="site-frame forum-page">
      <header className="forum-header">
        <div className="forum-header-inner">
          <LogoMark />
          <div className="forum-header-actions">
            <span className="user-identity">
              {user?.displayName} <span aria-hidden="true">/</span>{" "}
              {user?.platformRole === "system_admin"
                ? "system admin"
                : "student"}
            </span>
            <button
              className="menu-toggle"
              type="button"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <Menu size={19} aria-hidden="true" /> Menu
            </button>
          </div>
        </div>
        {menuOpen && (
          <div className="account-menu">
            <span>{user?.email}</span>
            <button type="button" onClick={() => void handleSignOut()}>
              <LogOut size={16} aria-hidden="true" /> Sign out
            </button>
          </div>
        )}
      </header>

      <main className="forum-main">
        <aside className="society-rail" aria-label="Society index">
          <p className="issue-label">Your index</p>
          <h2>Societies</h2>
          <p className="rail-empty">
            Your society shelf is waiting for its first entry.
          </p>
          <button className="quiet-button" type="button">
            <span>+</span> Discover societies
          </button>
        </aside>
        <section className="forum-feed" aria-labelledby="forum-title">
          <div className="feed-heading">
            <div>
              <p className="issue-label">RMIT Society · Front page</p>
              <h1 id="forum-title">The forum is open.</h1>
            </div>
            <span className="feed-date">
              Today <span aria-hidden="true">/</span> Issue 01
            </span>
          </div>
          <div className="feed-empty">
            <div className="empty-symbol">
              <BookOpen size={25} strokeWidth={1.5} aria-hidden="true" />
            </div>
            <h2>Make the first mark.</h2>
            <p>
              Threads from societies you join will collect here. Start by
              finding a community that feels like yours.
            </p>
            <button className="ink-button" type="button">
              Browse societies <ArrowRight size={17} aria-hidden="true" />
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
