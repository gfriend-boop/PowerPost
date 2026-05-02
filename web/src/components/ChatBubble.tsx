import { Logo } from "./Logo";

export function CoachBubble({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 16, alignItems: "flex-start", marginBottom: 12 }}>
      <div
        style={{
          flexShrink: 0,
          width: 44,
          height: 44,
          borderRadius: "50%",
          background: "var(--color-pink)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 8px 22px -10px rgba(255, 46, 204, 0.55)",
        }}
        aria-hidden
      >
        <Logo variant="square" tone="light" height={26} />
      </div>
      <div
        style={{
          background: "var(--color-white)",
          padding: "18px 22px",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-card)",
          maxWidth: 640,
          color: "var(--text-on-light)",
          flex: 1,
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function UserBubble({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "flex-end",
        marginBottom: 12,
      }}
    >
      <div
        style={{
          background: "var(--color-navy)",
          color: "var(--color-white)",
          padding: "14px 20px",
          borderRadius: "var(--radius-lg)",
          maxWidth: 520,
        }}
      >
        {children}
      </div>
    </div>
  );
}
