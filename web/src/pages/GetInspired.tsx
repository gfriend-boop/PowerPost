import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError, api } from "../api/client";
import { ThinkingState } from "../components/Thinking";

type Idea = {
  idea_id: string;
  title: string;
  suggested_angle: string;
  why_this: string;
  source_type: "performance_pattern" | "adjacent_theme" | "voice_gap" | "trend" | "manual_seed";
  evidence_post_ids: string[];
  workshop_seed_prompt: string;
  status: "active" | "saved" | "dismissed" | "used";
  created_at: string;
};

const SOURCE_LABELS: Record<Idea["source_type"], string> = {
  performance_pattern: "What worked",
  adjacent_theme: "Adjacent angle",
  voice_gap: "Underplayed",
  trend: "In the lane",
  manual_seed: "Seed",
};

export function GetInspired() {
  const navigate = useNavigate();
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null); // idea_id mid-action

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ ideas: Idea[] }>("/content/inspiration");
      setIdeas(res.ideas);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError("Could not load ideas");
    } finally {
      setLoading(false);
    }
  }

  async function refresh() {
    setRefreshing(true);
    setError(null);
    try {
      const res = await api.post<{ ideas: Idea[] }>("/content/inspiration/refresh", {});
      setIdeas(res.ideas);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError("Could not refresh ideas");
    } finally {
      setRefreshing(false);
    }
  }

  async function setStatus(idea: Idea, action: "save" | "dismiss") {
    setBusy(idea.idea_id);
    try {
      const res = await api.post<{ idea: Idea }>(
        `/content/inspiration/${idea.idea_id}/${action}`,
        {},
      );
      setIdeas((prev) =>
        prev.map((i) => (i.idea_id === idea.idea_id ? res.idea : i)).filter((i) => i.status !== "dismissed"),
      );
    } catch {
      // ignore
    } finally {
      setBusy(null);
    }
  }

  async function startWorkshop(idea: Idea) {
    setBusy(idea.idea_id);
    try {
      const res = await api.post<{ workshop_id: string }>(
        `/content/inspiration/${idea.idea_id}/workshop`,
        {},
      );
      navigate(`/workshop/${res.workshop_id}`);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError("Could not start workshop");
    } finally {
      setBusy(null);
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
            Get inspired
          </span>
        </div>

        <div className="stack-3" style={{ marginBottom: 24 }}>
          <h1 style={{ marginBottom: 4 }}>
            Ideas <span className="accent">made for you</span>.
          </h1>
          <p className="muted" style={{ margin: 0 }}>
            Built from your own posts and your voice profile. Not a content calendar. Not a generic prompt list.
          </p>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn btn-primary" onClick={refresh} disabled={refreshing}>
              {refreshing ? "Refreshing..." : "Refresh ideas"}
            </button>
          </div>
        </div>

        {error ? <ErrorBanner message={error} /> : null}

        {loading || refreshing ? (
          <ThinkingState
            messages={[
              "Pulling your top performing posts",
              "Looking for adjacent angles",
              "Spotting voice gaps",
              "Drafting ideas worth your time",
            ]}
          />
        ) : null}

        {loading ? null : ideas.length === 0 ? (
          <p className="muted">No active ideas. Hit refresh to generate a fresh set.</p>
        ) : (
          <div className="stack-3">
            {ideas.map((idea) => (
              <article
                key={idea.idea_id}
                className="card stack-3"
                style={{
                  borderLeft: idea.status === "saved" ? "4px solid var(--color-pink)" : undefined,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                  <div>
                    <SourceTag type={idea.source_type} />
                    <h3 style={{ margin: "8px 0 4px" }}>{idea.title}</h3>
                    <p style={{ margin: 0 }}>{idea.suggested_angle}</p>
                  </div>
                  {idea.status === "saved" ? (
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
                      Saved
                    </span>
                  ) : null}
                </div>

                <div
                  style={{
                    background: "var(--color-off-white)",
                    borderLeft: "3px solid var(--color-pink)",
                    borderRadius: "var(--radius-md)",
                    padding: "12px 16px",
                  }}
                >
                  <div
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: 11,
                      letterSpacing: "0.16em",
                      textTransform: "uppercase",
                      color: "var(--text-on-light-muted)",
                      fontWeight: 700,
                      marginBottom: 4,
                    }}
                  >
                    Why this
                  </div>
                  <div style={{ fontSize: 14, lineHeight: 1.5 }}>{idea.why_this}</div>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    className="btn btn-primary"
                    style={{ padding: "10px 16px", fontSize: 14 }}
                    onClick={() => startWorkshop(idea)}
                    disabled={busy === idea.idea_id}
                  >
                    Workshop this idea
                  </button>
                  {idea.status !== "saved" ? (
                    <button
                      className="btn btn-ghost"
                      style={{ padding: "10px 16px", fontSize: 14 }}
                      onClick={() => setStatus(idea, "save")}
                      disabled={busy === idea.idea_id}
                    >
                      Save for later
                    </button>
                  ) : null}
                  <button
                    className="btn btn-ghost"
                    style={{ padding: "10px 16px", fontSize: 14 }}
                    onClick={() => setStatus(idea, "dismiss")}
                    disabled={busy === idea.idea_id}
                  >
                    Not for me
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SourceTag({ type }: { type: Idea["source_type"] }) {
  return (
    <span
      style={{
        display: "inline-block",
        fontFamily: "var(--font-display)",
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        color: "var(--color-pink)",
        padding: "4px 10px",
        background: "rgba(255, 46, 204, 0.08)",
        borderRadius: "var(--radius-pill)",
      }}
    >
      {SOURCE_LABELS[type]}
    </span>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
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
      {message}
    </div>
  );
}
