import { useEffect, useState } from "react";
import { ApiError, api } from "../api/client";
import { ThinkingState } from "./Thinking";

type Topic = {
  watched_topic_id: string;
  label: string;
  source: "onboarding" | "detected_from_posts" | "user_added";
  priority: "normal" | "high";
  status: "suggested" | "active" | "paused" | "dismissed";
  evidence_count: number;
  evidence_post_ids: string[];
  reason: string | null;
  confidence: number | null;
  created_at: string;
  updated_at: string;
};

const SOURCE_LABELS: Record<Topic["source"], string> = {
  onboarding: "From onboarding",
  detected_from_posts: "Detected in your posts",
  user_added: "Added by you",
};

export function WatchedTopics() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [detectionMessage, setDetectionMessage] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ topics: Topic[] }>("/topics/watch");
      setTopics(res.topics);
    } catch {
      setError("Could not load watched topics");
    } finally {
      setLoading(false);
    }
  }

  async function addTopic(e: React.FormEvent) {
    e.preventDefault();
    const v = draft.trim();
    if (!v) return;
    setAdding(true);
    setError(null);
    try {
      const res = await api.post<{ topic: Topic }>("/topics/watch", { label: v });
      setTopics((prev) => [res.topic, ...prev.filter((t) => t.watched_topic_id !== res.topic.watched_topic_id)]);
      setDraft("");
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError("Could not add topic");
    } finally {
      setAdding(false);
    }
  }

  async function detectFromPosts() {
    setDetecting(true);
    setError(null);
    setDetectionMessage(null);
    try {
      const res = await api.post<{
        suggestions: Topic[];
        considered_posts: number;
      }>("/topics/watch/detect-from-posts", {});
      if (res.suggestions.length === 0) {
        setDetectionMessage(
          res.considered_posts < 3
            ? "Not enough post history yet. Sync more LinkedIn posts and try again."
            : "No new topic suggestions surfaced this round.",
        );
      } else {
        setDetectionMessage(
          `Found ${res.suggestions.length} suggested topic${res.suggestions.length === 1 ? "" : "s"}. Review below.`,
        );
      }
      await load();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError("Could not detect topics");
    } finally {
      setDetecting(false);
    }
  }

  async function patchTopic(topic: Topic, patch: Partial<{ status: Topic["status"]; priority: Topic["priority"] }>) {
    try {
      const res = await api.patch<{ topic: Topic }>(`/topics/watch/${topic.watched_topic_id}`, patch);
      setTopics((prev) =>
        prev.map((t) => (t.watched_topic_id === topic.watched_topic_id ? res.topic : t)),
      );
    } catch {
      // ignore
    }
  }

  async function deleteTopic(topic: Topic) {
    try {
      await api.delete(`/topics/watch/${topic.watched_topic_id}`);
      setTopics((prev) => prev.filter((t) => t.watched_topic_id !== topic.watched_topic_id));
    } catch {
      // ignore
    }
  }

  if (loading) {
    return (
      <div className="muted" style={{ fontSize: 14 }}>
        Loading watched topics...
      </div>
    );
  }

  const suggested = topics.filter((t) => t.status === "suggested");
  const active = topics.filter((t) => t.status === "active");
  const paused = topics.filter((t) => t.status === "paused");

  return (
    <div className="stack-4">
      {error ? (
        <div
          role="alert"
          style={{
            background: "rgba(200, 29, 106, 0.10)",
            color: "#c81d6a",
            padding: "10px 14px",
            borderRadius: "var(--radius-md)",
            fontWeight: 600,
          }}
        >
          {error}
        </div>
      ) : null}

      <form onSubmit={addTopic} className="stack-2">
        <span className="field-label">Add a topic</span>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            className="field-input"
            placeholder="e.g. Leadership communication during layoffs"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={adding}
            style={{ flex: 1 }}
          />
          <button
            type="submit"
            className="btn btn-primary"
            disabled={!draft.trim() || adding}
            style={{ padding: "10px 16px" }}
          >
            {adding ? "Adding..." : "Add"}
          </button>
        </div>
      </form>

      <div className="stack-2">
        <span className="field-label">Detect from your posts</span>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          PowerPost will look at your cached LinkedIn posts and surface recurring themes worth
          watching. We'll suggest, you decide.
        </p>
        {detecting ? (
          <ThinkingState
            variant="inline"
            messages={[
              "Reading your post history",
              "Counting recurring themes",
              "Checking which themes track with your top posts",
              "Drafting suggestions",
            ]}
          />
        ) : (
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={detectFromPosts}
              style={{ padding: "8px 14px" }}
            >
              Detect topics
            </button>
            {detectionMessage ? (
              <span style={{ fontSize: 13, color: "var(--text-on-light-muted)" }}>
                {detectionMessage}
              </span>
            ) : null}
          </div>
        )}
      </div>

      {suggested.length > 0 ? (
        <div className="stack-2">
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 11,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "var(--text-on-light-muted)",
              fontWeight: 700,
            }}
          >
            Suggested · {suggested.length}
          </span>
          {suggested.map((t) => (
            <SuggestedRow
              key={t.watched_topic_id}
              topic={t}
              onAccept={() => patchTopic(t, { status: "active" })}
              onDismiss={() => patchTopic(t, { status: "dismissed" })}
              onPriority={() => patchTopic(t, { priority: t.priority === "high" ? "normal" : "high" })}
            />
          ))}
        </div>
      ) : null}

      {active.length > 0 ? (
        <div className="stack-2">
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 11,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "var(--color-pink)",
              fontWeight: 700,
            }}
          >
            Active · {active.length}
          </span>
          {active.map((t) => (
            <ActiveRow
              key={t.watched_topic_id}
              topic={t}
              onPause={() => patchTopic(t, { status: "paused" })}
              onPriority={() => patchTopic(t, { priority: t.priority === "high" ? "normal" : "high" })}
              onDelete={t.source === "user_added" ? () => deleteTopic(t) : undefined}
            />
          ))}
        </div>
      ) : null}

      {paused.length > 0 ? (
        <div className="stack-2">
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 11,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "var(--text-on-light-muted)",
              fontWeight: 700,
            }}
          >
            Paused · {paused.length}
          </span>
          {paused.map((t) => (
            <PausedRow
              key={t.watched_topic_id}
              topic={t}
              onResume={() => patchTopic(t, { status: "active" })}
              onDelete={t.source === "user_added" ? () => deleteTopic(t) : undefined}
            />
          ))}
        </div>
      ) : null}

      {suggested.length === 0 && active.length === 0 && paused.length === 0 ? (
        <p className="muted" style={{ fontSize: 14 }}>
          No watched topics yet. Add one above, or hit "Detect topics" to seed from your post
          history.
        </p>
      ) : null}
    </div>
  );
}

function SuggestedRow({
  topic,
  onAccept,
  onDismiss,
  onPriority,
}: {
  topic: Topic;
  onAccept: () => void;
  onDismiss: () => void;
  onPriority: () => void;
}) {
  return (
    <div
      style={{
        border: "1.5px dashed var(--border-soft)",
        borderRadius: "var(--radius-md)",
        padding: "12px 16px",
        background: "var(--color-white)",
      }}
    >
      <Header topic={topic} />
      {topic.reason ? (
        <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--text-on-light-muted)" }}>
          {topic.reason}
        </p>
      ) : null}
      <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          className="btn btn-primary"
          style={{ padding: "6px 12px", fontSize: 13 }}
          onClick={onAccept}
        >
          Confirm and watch
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          style={{ padding: "6px 12px", fontSize: 13 }}
          onClick={onPriority}
        >
          {topic.priority === "high" ? "Make normal" : "Mark high priority"}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          style={{ padding: "6px 12px", fontSize: 13 }}
          onClick={onDismiss}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

function ActiveRow({
  topic,
  onPause,
  onPriority,
  onDelete,
}: {
  topic: Topic;
  onPause: () => void;
  onPriority: () => void;
  onDelete?: () => void;
}) {
  return (
    <div
      style={{
        border: "2px solid var(--color-pink)",
        borderRadius: "var(--radius-md)",
        padding: "12px 16px",
        background: "rgba(255, 46, 204, 0.04)",
      }}
    >
      <Header topic={topic} />
      <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          className="btn btn-ghost"
          style={{ padding: "6px 12px", fontSize: 13 }}
          onClick={onPriority}
        >
          {topic.priority === "high" ? "Make normal" : "Mark high priority"}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          style={{ padding: "6px 12px", fontSize: 13 }}
          onClick={onPause}
        >
          Pause
        </button>
        {onDelete ? (
          <button
            type="button"
            className="btn btn-ghost"
            style={{ padding: "6px 12px", fontSize: 13 }}
            onClick={onDelete}
          >
            Remove
          </button>
        ) : null}
      </div>
    </div>
  );
}

function PausedRow({
  topic,
  onResume,
  onDelete,
}: {
  topic: Topic;
  onResume: () => void;
  onDelete?: () => void;
}) {
  return (
    <div
      style={{
        border: "1.5px solid var(--border-soft)",
        borderRadius: "var(--radius-md)",
        padding: "12px 16px",
        background: "var(--color-white)",
        opacity: 0.75,
      }}
    >
      <Header topic={topic} />
      <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          className="btn btn-ghost"
          style={{ padding: "6px 12px", fontSize: 13 }}
          onClick={onResume}
        >
          Resume
        </button>
        {onDelete ? (
          <button
            type="button"
            className="btn btn-ghost"
            style={{ padding: "6px 12px", fontSize: 13 }}
            onClick={onDelete}
          >
            Remove
          </button>
        ) : null}
      </div>
    </div>
  );
}

function Header({ topic }: { topic: Topic }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>{topic.label}</span>
        {topic.priority === "high" ? (
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 10,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              fontWeight: 700,
              padding: "2px 8px",
              borderRadius: "var(--radius-pill)",
              background: "var(--color-navy)",
              color: "var(--color-white)",
            }}
          >
            High priority
          </span>
        ) : null}
      </div>
      <span
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 10,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--text-on-light-muted)",
          fontWeight: 700,
          whiteSpace: "nowrap",
        }}
      >
        {SOURCE_LABELS[topic.source]}
        {topic.evidence_count > 0 ? ` · ${topic.evidence_count} signals` : ""}
      </span>
    </div>
  );
}
