import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../auth/context";
import { Logo } from "./Logo";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const onAuthFlow = location.pathname.startsWith("/onboarding");

  return (
    <div style={{ minHeight: "100%", display: "flex", flexDirection: "column" }}>
      <header
        style={{
          background: "var(--color-navy)",
          color: "var(--text-on-dark)",
          padding: "16px 32px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
        }}
      >
        <Link to="/" style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Logo variant="primary" height={36} />
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: "1.1rem",
              color: "var(--color-white)",
              letterSpacing: "0.02em",
            }}
          >
            PowerPost
          </span>
        </Link>
        {user && !onAuthFlow ? (
          <nav style={{ display: "flex", alignItems: "center", gap: 24 }}>
            <Link to="/dashboard" style={{ color: "var(--text-on-dark)", fontWeight: 500 }}>
              Dashboard
            </Link>
            <Link to="/inspire" style={{ color: "var(--text-on-dark)", fontWeight: 500 }}>
              Inspired
            </Link>
            <Link to="/improve" style={{ color: "var(--text-on-dark)", fontWeight: 500 }}>
              Improve
            </Link>
            <Link to="/workshop" style={{ color: "var(--text-on-dark)", fontWeight: 500 }}>
              Workshop
            </Link>
            <span style={{ color: "var(--text-on-dark-muted)", fontSize: 14 }}>
              {user.name}
            </span>
            <button className="btn btn-ghost" onClick={logout} style={{ color: "var(--text-on-dark)", borderColor: "rgba(255,255,255,0.18)" }}>
              Sign out
            </button>
          </nav>
        ) : null}
      </header>
      <main style={{ flex: 1, display: "flex", flexDirection: "column" }}>{children}</main>
      <footer
        style={{
          background: "var(--color-navy)",
          color: "var(--text-on-dark-muted)",
          padding: "20px 32px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: 13,
        }}
      >
        <Logo variant="text" height={18} />
        <span>PowerPost by PowerSpeak Academy</span>
      </footer>
    </div>
  );
}
