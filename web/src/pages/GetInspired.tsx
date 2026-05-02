import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError, api } from "../api/client";
import { ThinkingState } from "../components/Thinking";

type IdeaSource = "all" | "proven" | "adjacent" | "timely" | "stretch";

type SourceType =
  | "performance_pattern"
  | "adjacent_theme"
  | "voice_gap"
  | "timely"
  | "manual_seed";

type Idea = {
  idea_id: string;
  title: string;
  suggested_angle: string;
  why_this: string;
  source_type: SourceType;
  evidence_post_ids: string[];
  watched_topic_ids?: string[];
  timeliness_rationale?: string | null;
  workshop_seed_prompt: string;
  status: "active" | "saved" | "dismissed" | "used";
  created_at: string;
};

type WatchedTopic = {
  watched_topic_id: string;
  label: string;
  status: "suggested" | "active" | "paused" | "dismissed";
  priority: "normal" | "high";
};

const SOURCE_LABELS: Record<SourceType, string> = {
  performance_pattern: "Proven Theme",
  adjacent_theme: "Adjacent Angle",
  voice_gap: "Voice Stretch",
  timely: "Timely",
  manual_seed: "Seeded",
};

const SOURCE_TABS: Array<{ value: IdeaSource; label: string }> = [
  { value: "all", label: "All" },
  { value: "proven", label: "Proven" },
  { value: "adjacent", label: "Adjacent" },
  { value: "timely", label: "Timely" },
  { value: "stretch", label: "Stretch" },
];

export function GetInspired() {
  const navigate = useNavigate();
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [activeSource, setActiveSource] = useState<IdeaSource>("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [watchedTopicCount, setWatchedTopicCount] = useState<number>(0);

  useEffect(() => {
    void api
      .get<{ topics: WatchedTopic[] }>("/topics/watch")
      .then((res) => {
        const active = res.topics.filter((t) => t.status === "active").length;
        setWatchedTopicCount(active);
      })
      .catch(() => setWatchedTopicCount(0));
  }, []);

  useEffect(() => {
    void load(activeSource);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSource]);

  async function load(source: IdeaSource) {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ ideas: Idea[] }>(
        `/content/inspiration?idea_source=${source}`,
      );
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
      const res = await api.post<{ ideas: Idea[] }>("/content/inspiration/refresh", {
        idea_source: activeSource,
      });
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
        prev
          .map((i) => (i.idea_id === idea.idea_id ? res.idea : i))
          .filter((i) => i.status !== "dismissed"),
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

  const showTimelyEmptyState =
    activeSource === "timely" && watchedTopicCount === 0 && !loading && !refreshing;

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

        <div className="stack-3" style={{ marginBottom: 20 }}>
          <h1 style={{ marginBottom: 4 }}>
            Ideas <span className="accent">made for you</span>.
          </h1>
          <p className="muted" style={{ margin: 0 }}>
            Built from your own posts and your voice profile. Not a content calendar. Not a generic prompt list.
          </p>
        </div>

        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            alignItems: "center",
            marginBottom: 20,
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "var(--text-on-light-muted)",
              marginRight: 4,
            }}
          >
            Idea source
          </span>
          {SOURCE_TABS.map((tab) => {
            const active = activeSource === tab.value;
            return (
              <button
                key={tab.value}
                type="button"
                onClick={() => setActiveSource(tab.value)}
                style={{
                  padding: "6px 14px",
                  borderRadius: "var(--radius-pill)",
                  border: active
                    ? "2px solid var(--color-pink)"
                    : "1.5px solid var(--border-soft)",
                  background: active ? "var(--color-navy)" : "var(--color-white)",
                  color: active ? "var(--color-white)" : "var(--text-on-light)",
                  fontFamily: "var(--font-display)",
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: "pointer",
                  transition: "background 0.15s ease, color 0.15s ease",
                }}
              >
                {tab.label}
              </button>
            );
          })}
          <button
            className="btn btn-primary"
            style={{ marginLeft: "auto", padding: "8px 16px", fontSize: 13 }}
            onClick={refresh}
            disabled={refreshing || showTimelyEmptyState}
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {error ? <ErrorBanner message={error} /> : null}

        {showTimelyEmptyState ? (
          <div
            className="card stack-3"
            style={{
              borderLeft: "3px solid var(--color-pink)",
            }}
          >
            <h3 style={{ margin: 0 }}>No watched topics yet</h3>
            <p className="muted" style={{ margin: 0 }}>
              Add a few topics to watch so PowerPost can find timely ideas that actually fit your
              voice. We won't surface trends just because they're loud.
            </p>
            <div>
              <Link
                to="/voice/edit"
                className="btn btn-primary"
                style={{ padding: "10px 16px", fontSize: 14, textDecoration: "none" }}
              >
                Manage Topics to Watch
              </Link>
            </div>
          </div>
        ) : null}

        {loading || refreshing ? (
          <ThinkingState
            messages={
              activeSource === "timely"
                ? [
                    "Reading your watched topics",
                    "Looking for credible angles",
                    "Filtering out generic trends",
                    "Drafting timely ideas that fit you",
                  ]
                : [
                    "Pulling your top performing posts",
                    "Looking for adjacent angles",
                    "Spotting voice gaps",
                    "Drafting ideas worth your time",
                  ]
            }
          />
        ) : null}

        {loading || showTimelyEmptyState ? null : ideas.length === 0 ? (
          <p className="muted">No ideas in this source yet. Hit Refresh to generate a fresh set.</p>
        ) : (
          <div className="stack-3">
            {ideas.map((idea) => (
              <IdeaCard
                key={idea.idea_id}
                idea={idea}
                busy={busy === idea.idea_id}
                onStartWorkshop={() => startWorkshop(idea)}
                onSave={() => setStatus(idea, "save")}
                onDismiss={() => setStatus(idea, "dismiss")}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function IdeaCard({
  idea,
  busy,
  onStartWorkshop,
  onSave,
  onDismiss,
}: {
  idea: Idea;
  busy: boolean;
  onStartWorkshop: () => void;
  onSave: () => void;
  onDismiss: () => void;
}) {
  return (
    <article
      className="card stack-3"
      style={{
        borderLeft: idea.status === "saved" ? "4px solid var(--color-pink)" : undefined,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
        }}
      >
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

      {idea.source_type === "timely" && idea.timeliness_rationale ? (
        <div
          style={{
            background: "var(--color-navy)",
            color: "var(--color-white)",
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
              color: "var(--color-pink)",
              fontWeight: 700,
              marginBottom: 4,
            }}
          >
            Why now, why you
          </div>
          <div style={{ fontSize: 14, lineHeight: 1.55 }}>{idea.timeliness_rationale}</div>
        </div>
      ) : null}

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
          onClick={onStartWorkshop}
          disabled={busy}
        >
          {busy ? "Starting workshop..." : "Workshop this idea"}
        </button>
        {idea.status !== "saved" ? (
          <button
            className="btn btn-ghost"
            style={{ padding: "10px 16px", fontSize: 14 }}
            onClick={onSave}
            disabled={busy}
          >
            Save for later
          </button>
        ) : null}
        <button
          className="btn btn-ghost"
          style={{ padding: "10px 16px", fontSize: 14 }}
          onClick={onDismiss}
          disabled={busy}
        >
          Not for me
        </button>
      </div>
    </article>
  );
}

function SourceTag({ type }: { type: SourceType }) {
  const isTimely = type === "timely";
  return (
    <span
      style={{
        display: "inline-block",
        fontFamily: "var(--font-display)",
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        color: isTimely ? "var(--color-white)" : "var(--color-pink)",
        padding: "4px 10px",
        background: isTimely ? "var(--color-pink)" : "rgba(255, 46, 204, 0.08)",
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
