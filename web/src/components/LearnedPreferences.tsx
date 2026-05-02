import { useEffect, useState } from "react";
import { api } from "../api/client";

type Preference = {
  learned_preference_id: string;
  preference_type: string;
  preference_summary: string;
  prompt_instruction: string;
  confidence: number;
  evidence_count: number;
  status: "suggested" | "active" | "rejected" | "archived";
  created_at: string;
  updated_at: string;
};

const TYPE_LABELS: Record<string, string> = {
  cta_style: "CTA style",
  opening_style: "Opening style",
  vulnerability_level: "Vulnerability level",
  post_length: "Post length",
  tone: "Tone",
  structure: "Structure",
  vocabulary: "Vocabulary",
  topic_angle: "Topic angle",
  formatting: "Formatting",
};

export function LearnedPreferences() {
  const [items, setItems] = useState<Preference[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await api.get<{ preferences: Preference[] }>("/feedback/preferences");
      setItems(res.preferences);
    } catch {
      setError("Could not load learned preferences");
    } finally {
      setLoading(false);
    }
  }

  async function setStatus(pref: Preference, status: Preference["status"]) {
    try {
      const res = await api.patch<{ preference: Preference }>(
        `/feedback/preferences/${pref.learned_preference_id}`,
        { status },
      );
      setItems((prev) =>
        prev
          .map((p) => (p.learned_preference_id === pref.learned_preference_id ? res.preference : p))
          .filter((p) => p.status !== "archived"),
      );
    } catch {
      // ignore
    }
  }

  if (loading) {
    return (
      <div className="muted" style={{ padding: 16 }}>
        Loading learned preferences...
      </div>
    );
  }

  if (error) {
    return (
      <div className="field-error" style={{ padding: 16 }}>
        {error}
      </div>
    );
  }

  const suggested = items.filter((i) => i.status === "suggested");
  const active = items.filter((i) => i.status === "active");

  if (suggested.length === 0 && active.length === 0) {
    return (
      <div className="muted" style={{ fontSize: 14 }}>
        No learned preferences yet. As you give feedback in Workshop and Improve My Draft, PowerPost
        will start surfacing patterns here.
      </div>
    );
  }

  return (
    <div className="stack-3">
      {suggested.length > 0 ? (
        <div>
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
          <div className="stack-2" style={{ marginTop: 8 }}>
            {suggested.map((p) => (
              <PrefRow key={p.learned_preference_id} pref={p} onStatus={setStatus} suggested />
            ))}
          </div>
        </div>
      ) : null}

      {active.length > 0 ? (
        <div>
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
          <div className="stack-2" style={{ marginTop: 8 }}>
            {active.map((p) => (
              <PrefRow key={p.learned_preference_id} pref={p} onStatus={setStatus} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PrefRow({
  pref,
  onStatus,
  suggested,
}: {
  pref: Preference;
  onStatus: (p: Preference, status: Preference["status"]) => void;
  suggested?: boolean;
}) {
  return (
    <div
      style={{
        border: suggested ? "1.5px dashed var(--border-soft)" : "2px solid var(--color-pink)",
        background: suggested ? "var(--color-white)" : "rgba(255, 46, 204, 0.04)",
        borderRadius: "var(--radius-md)",
        padding: "12px 16px",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
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
          {TYPE_LABELS[pref.preference_type] ?? pref.preference_type}
        </span>
        <span style={{ fontSize: 12, color: "var(--text-on-light-muted)" }}>
          confidence {Math.round(pref.confidence * 100)}% · {pref.evidence_count} signal{pref.evidence_count === 1 ? "" : "s"}
        </span>
      </div>
      <p style={{ margin: "6px 0", fontSize: 14, lineHeight: 1.5 }}>{pref.preference_summary}</p>
      <details>
        <summary
          style={{
            fontSize: 12,
            color: "var(--text-on-light-muted)",
            cursor: "pointer",
            userSelect: "none",
          }}
        >
          Show prompt instruction
        </summary>
        <p
          style={{
            margin: "6px 0 0",
            fontSize: 13,
            lineHeight: 1.5,
            color: "var(--text-on-light-muted)",
            fontStyle: "italic",
          }}
        >
          {pref.prompt_instruction}
        </p>
      </details>
      <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
        {suggested ? (
          <>
            <button
              type="button"
              className="btn btn-primary"
              style={{ padding: "6px 12px", fontSize: 13 }}
              onClick={() => onStatus(pref, "active")}
            >
              Confirm
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ padding: "6px 12px", fontSize: 13 }}
              onClick={() => onStatus(pref, "rejected")}
            >
              Reject
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ padding: "6px 12px", fontSize: 13 }}
              onClick={() => onStatus(pref, "suggested")}
            >
              Move back to suggested
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ padding: "6px 12px", fontSize: 13 }}
              onClick={() => onStatus(pref, "archived")}
            >
              Archive
            </button>
          </>
        )}
      </div>
    </div>
  );
}
