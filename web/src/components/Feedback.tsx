import { useState } from "react";
import { api } from "../api/client";

type Surface = "workshop" | "improve_draft" | "inspiration" | "post_score" | "voice_settings";
type EventType =
  | "thumbs_up"
  | "thumbs_down"
  | "manual_edit"
  | "suggestion_accepted"
  | "suggestion_rejected"
  | "suggestion_accept_all"
  | "draft_copied"
  | "draft_finalized"
  | "score_requested"
  | "optimization_requested"
  | "learned_preference_confirmed"
  | "learned_preference_rejected";

export type FeedbackContext = {
  surface: Surface;
  source_id?: string;
  content_id?: string;
  raw_content_after?: string;
  selected_kpi?: string;
  voice_score?: number;
  performance_score?: number;
};

/**
 * Lightweight thumbs + note widget. Posts to /feedback/events. Self-contained
 * so any place that produces a draft or recommendation can drop it in.
 */
export function FeedbackControls({
  ctx,
  compact = false,
}: {
  ctx: FeedbackContext;
  compact?: boolean;
}) {
  const [submitted, setSubmitted] = useState<EventType | null>(null);
  const [showNote, setShowNote] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const send = async (eventType: EventType, userNote?: string) => {
    setBusy(true);
    try {
      await api.post("/feedback/events", {
        surface: ctx.surface,
        event_type: eventType,
        source_id: ctx.source_id,
        content_id: ctx.content_id,
        raw_content_after: ctx.raw_content_after,
        selected_kpi: ctx.selected_kpi,
        voice_score_after: ctx.voice_score,
        performance_score_after: ctx.performance_score,
        user_note: userNote,
      });
      setSubmitted(eventType);
    } catch {
      // ignore — feedback is best-effort
    } finally {
      setBusy(false);
    }
  };

  if (submitted && !showNote) {
    return (
      <div
        style={{
          fontSize: 13,
          color: "var(--text-on-light-muted)",
          padding: compact ? 0 : "8px 0",
        }}
      >
        {submitted === "thumbs_up"
          ? "Thanks. PowerPost is learning."
          : submitted === "thumbs_down"
            ? "Got it. Tell PowerPost what to remember if you want to."
            : "Saved."}
        {submitted === "thumbs_down" ? (
          <button
            onClick={() => setShowNote(true)}
            style={{
              border: 0,
              background: "transparent",
              color: "var(--color-pink)",
              fontWeight: 600,
              cursor: "pointer",
              marginLeft: 8,
              padding: 0,
            }}
          >
            Add a note
          </button>
        ) : null}
      </div>
    );
  }

  if (showNote) {
    return (
      <div className="stack-2" style={{ marginTop: 6 }}>
        <textarea
          className="field-textarea"
          rows={2}
          value={note}
          placeholder="What should PowerPost remember about how you actually want this to sound?"
          onChange={(e) => setNote(e.target.value)}
          style={{ fontSize: 14 }}
        />
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className="btn btn-primary"
            style={{ padding: "8px 14px", fontSize: 13 }}
            disabled={busy || !note.trim()}
            onClick={async () => {
              await send("thumbs_down", note.trim());
              setNote("");
              setShowNote(false);
            }}
          >
            Remember this
          </button>
          <button
            className="btn btn-ghost"
            style={{ padding: "8px 14px", fontSize: 13 }}
            onClick={() => {
              setNote("");
              setShowNote(false);
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        alignItems: "center",
        flexWrap: "wrap",
        marginTop: compact ? 0 : 8,
      }}
    >
      <button
        type="button"
        className="btn btn-ghost"
        style={{ padding: "6px 12px", fontSize: 13 }}
        disabled={busy}
        onClick={() => send("thumbs_up")}
      >
        This sounds like me
      </button>
      <button
        type="button"
        className="btn btn-ghost"
        style={{ padding: "6px 12px", fontSize: 13 }}
        disabled={busy}
        onClick={() => setShowNote(true)}
      >
        Not quite
      </button>
    </div>
  );
}
