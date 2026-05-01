import { Link } from "react-router-dom";

export function Landing() {
  return (
    <div
      style={{
        flex: 1,
        background: "var(--gradient-onboarding)",
        color: "var(--text-on-dark)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "var(--space-7)",
      }}
    >
      <div
        style={{
          maxWidth: 720,
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 24,
        }}
      >
        <span
          style={{
            color: "var(--color-pink)",
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            letterSpacing: "0.18em",
            fontSize: 14,
            textTransform: "uppercase",
          }}
        >
          Early access
        </span>
        <h1 style={{ color: "var(--color-white)", marginBottom: 0 }}>
          Show up on LinkedIn as <span className="accent">you</span>. No template.
        </h1>
        <p style={{ fontSize: 18, color: "var(--text-on-dark-muted)", maxWidth: 560 }}>
          PowerPost learns how you actually sound, who you are trying to reach, and what
          LinkedIn is meant to do for you. Then it writes drafts that hit, every time.
          Built by PowerSpeak Academy.
        </p>
        <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
          <Link to="/signup" className="btn btn-primary">
            Start free trial
          </Link>
          <Link to="/login" className="btn btn-ghost" style={{ color: "var(--color-white)", borderColor: "rgba(255,255,255,0.3)" }}>
            I already have an account
          </Link>
        </div>
        <span style={{ fontSize: 13, color: "var(--text-on-dark-muted)" }}>
          14 days of Builder access. No credit card.
        </span>
      </div>
    </div>
  );
}
