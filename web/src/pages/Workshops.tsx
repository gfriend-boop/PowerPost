import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";

type WorkshopSessionRow = {
  workshop_id: string;
  title: string;
  status: string;
  created_at: string;
  last_message_at: string;
};

export function Workshops() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<WorkshopSessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    void api
      .get<{ sessions: WorkshopSessionRow[] }>("/workshop")
      .then((res) => setSessions(res.sessions))
      .catch(() => setError("Could not load your workshop sessions"))
      .finally(() => setLoading(false));
  }, []);

  async function startNew() {
    setStarting(true);
    try {
      // The new-session screen has its own goal picker; navigating with no
      // workshopId routes to that screen.
      navigate("/workshop");
    } finally {
      setStarting(false);
    }
  }

  return (
    <div style={{ flex: 1, padding: "var(--space-6) var(--space-5)", background: "var(--surface-page)" }}>
      <div style={{ maxWidth: 880, margin: "0 auto" }}>
        <div style={{ marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Link to="/dashboard" style={{ color: "var(--text-on-light-muted)", fontWeight: 500 }}>
            ← Back to dashboard
          </Link>
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "var(--text-on-light-muted)",
            }}
          >
            Workshop history
          </span>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 16,
            marginBottom: 24,
            flexWrap: "wrap",
          }}
        >
          <div style={{ flex: "1 1 280px", minWidth: 0 }}>
            <h1 style={{ marginBottom: 4 }}>
              Every <span className="accent">workshop</span> session.
            </h1>
            <p className="muted" style={{ margin: 0 }}>
              Pick up a draft you started, or open a new one.
            </p>
          </div>
          <button
            className="btn btn-primary"
            onClick={startNew}
            disabled={starting}
            style={{ flexShrink: 0 }}
          >
            Start a new workshop
          </button>
        </div>

        {error ? (
          <div
            role="alert"
            style={{
              background: "rgba(200, 29, 106, 0.10)",
              color: "#c81d6a",
              padding: "10px 14px",
              borderRadius: "var(--radius-md)",
              fontWeight: 600,
              marginBottom: 16,
            }}
          >
            {error}
          </div>
        ) : null}

        {loading ? (
          <p className="muted">Loading your sessions...</p>
        ) : sessions.length === 0 ? (
          <p className="muted">
            You haven't started any workshops yet. Use the button above to open one.
          </p>
        ) : (
          <div className="stack-2">
            {sessions.map((s) => (
              <Link
                key={s.workshop_id}
                to={`/workshop/${s.workshop_id}`}
                className="card"
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  textDecoration: "none",
                  color: "var(--text-on-light)",
                  padding: "16px 20px",
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{s.title}</div>
                  <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
                    Last activity {new Date(s.last_message_at).toLocaleString()}
                  </div>
                </div>
                <span
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 11,
                    letterSpacing: "0.16em",
                    textTransform: "uppercase",
                    color: "var(--color-pink)",
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                  }}
                >
                  Open →
                </span>
              </Link>
            ))}
          </div>
        )}

        <div style={{ height: 60 }} />
      </div>
    </div>
  );
}
