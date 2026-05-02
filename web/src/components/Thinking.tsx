import { useEffect, useState } from "react";

const DEFAULT_MESSAGES = [
  "Reading your voice profile",
  "Checking your past post patterns",
  "Looking for the voice / performance tension",
  "Drafting in your style",
  "Tightening the recommendation",
];

/**
 * Calm, premium loading indicator for any LLM-bound action. Rotates through
 * a list of status messages with animated ellipses. Honours
 * prefers-reduced-motion by falling back to the first message only.
 */
export function ThinkingState({
  messages = DEFAULT_MESSAGES,
  intervalMs = 2200,
  variant = "card",
  visible = true,
}: {
  messages?: string[];
  intervalMs?: number;
  variant?: "card" | "inline" | "bubble";
  visible?: boolean;
}) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!visible || messages.length <= 1) return;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const id = window.setInterval(
      () => setIndex((i) => (i + 1) % messages.length),
      intervalMs,
    );
    return () => window.clearInterval(id);
  }, [messages.length, intervalMs, visible]);

  if (!visible) return null;

  const message = messages[index] ?? messages[0] ?? "Working";

  if (variant === "inline") {
    return (
      <span
        style={{
          display: "inline-flex",
          gap: 8,
          alignItems: "center",
          color: "var(--text-on-light-muted)",
          fontSize: 14,
        }}
      >
        <Pulse />
        <span>
          {message}
          <Ellipses />
        </span>
      </span>
    );
  }

  if (variant === "bubble") {
    return (
      <div
        style={{
          display: "inline-flex",
          gap: 10,
          alignItems: "center",
          color: "var(--text-on-light-muted)",
          fontSize: 14,
        }}
      >
        <Pulse />
        <span>
          {message}
          <Ellipses />
        </span>
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "16px 20px",
        background: "var(--color-white)",
        border: "1px solid var(--border-soft)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-card)",
      }}
    >
      <Pulse />
      <div>
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "var(--text-on-light-muted)",
          }}
        >
          PowerPost is thinking
        </div>
        <div style={{ fontSize: 15, marginTop: 2, fontWeight: 500 }}>
          {message}
          <Ellipses />
        </div>
      </div>
    </div>
  );
}

function Pulse() {
  return (
    <span
      aria-hidden
      style={{
        position: "relative",
        width: 14,
        height: 14,
      }}
    >
      <style>{`
        @keyframes pp-pulse-outer {
          0% { transform: scale(0.6); opacity: 0.6; }
          70% { transform: scale(1.6); opacity: 0; }
          100% { transform: scale(1.6); opacity: 0; }
        }
      `}</style>
      <span
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          background: "var(--color-pink)",
          opacity: 0.4,
          animation: "pp-pulse-outer 1.6s ease-out infinite",
        }}
      />
      <span
        style={{
          position: "absolute",
          inset: 3,
          borderRadius: "50%",
          background: "var(--color-pink)",
        }}
      />
    </span>
  );
}

function Ellipses() {
  return (
    <span aria-hidden style={{ display: "inline-block", marginLeft: 2 }}>
      <style>{`
        @keyframes pp-ellipses-1 { 0%, 60%, 100% { opacity: 0.25; } 30% { opacity: 1; } }
        @keyframes pp-ellipses-2 { 0%, 60%, 100% { opacity: 0.25; } 30% { opacity: 1; } }
        @keyframes pp-ellipses-3 { 0%, 60%, 100% { opacity: 0.25; } 30% { opacity: 1; } }
      `}</style>
      <span style={{ animation: "pp-ellipses-1 1.4s 0s infinite" }}>.</span>
      <span style={{ animation: "pp-ellipses-2 1.4s 0.2s infinite" }}>.</span>
      <span style={{ animation: "pp-ellipses-3 1.4s 0.4s infinite" }}>.</span>
    </span>
  );
}
