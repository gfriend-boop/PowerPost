import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { CoachBubble, UserBubble } from "../components/ChatBubble";
import { FeedbackControls } from "../components/Feedback";
import { InlineScoreBadge, type ScoreShape } from "../components/Score";

type Stance = "clarify" | "draft" | "refine";

type StoredAssistantContent = { message: string; draft: string | null };

type WorkshopMessage = {
  message_id: string;
  role: "user" | "assistant";
  content: string; // raw stored
  metadata: Record<string, unknown>;
  created_at: string;
};

type WorkshopReply = {
  message_id: string;
  stance: Stance;
  message: string;
  draft: string | null;
  validation_flags: Array<{ rule: string; count?: number }>;
  history_used: boolean;
  score: ScoreShape | null;
};

export function Workshop() {
  const params = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const [workshopId, setWorkshopId] = useState<string | null>(params.id ?? null);
  const [seed, setSeed] = useState("");
  const [messages, setMessages] = useState<WorkshopMessage[]>([]);
  const [composing, setComposing] = useState("");
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedDraftIds, setSavedDraftIds] = useState<Record<string, string>>({});
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setWorkshopId(params.id ?? null);
  }, [params.id]);

  useEffect(() => {
    if (!workshopId) return;
    void api
      .get<{ session: unknown; messages: WorkshopMessage[] }>(`/workshop/${workshopId}`)
      .then((res) => {
        setMessages(res.messages);
      })
      .catch(() => {
        setError("Could not load this workshop session.");
      });
  }, [workshopId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, thinking]);

  const startSession = async () => {
    setThinking(true);
    setError(null);
    try {
      const res = await api.post<{ workshop_id: string; reply: WorkshopReply }>(
        "/workshop/start",
        seed.trim() ? { seed: seed.trim() } : {},
      );
      setWorkshopId(res.workshop_id);
      navigate(`/workshop/${res.workshop_id}`);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError("Could not start a workshop");
    } finally {
      setThinking(false);
    }
  };

  const sendMessage = async () => {
    if (!workshopId || !composing.trim()) return;
    const text = composing.trim();
    setComposing("");
    setThinking(true);
    setError(null);
    // Optimistic user bubble
    setMessages((prev) => [
      ...prev,
      {
        message_id: `temp-${Date.now()}`,
        role: "user",
        content: text,
        metadata: {},
        created_at: new Date().toISOString(),
      },
    ]);
    try {
      const res = await api.post<{ reply: WorkshopReply }>("/workshop/message", {
        workshop_id: workshopId,
        message: text,
      });
      setMessages((prev) => [
        ...prev,
        {
          message_id: res.reply.message_id,
          role: "assistant",
          content: JSON.stringify({ message: res.reply.message, draft: res.reply.draft }),
          metadata: {
            stance: res.reply.stance,
            validation_flags: res.reply.validation_flags,
            score: res.reply.score,
          },
          created_at: new Date().toISOString(),
        },
      ]);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError("Could not send message");
    } finally {
      setThinking(false);
    }
  };

  const saveDraft = async (messageId: string, draft: string) => {
    if (!workshopId) return;
    const res = await api.post<{ content_id: string; draft_content: string }>(
      "/workshop/save-draft",
      { workshop_id: workshopId, draft_content: draft },
    );
    setSavedDraftIds((prev) => ({ ...prev, [messageId]: res.content_id }));
  };

  if (!workshopId) {
    return (
      <div style={{ flex: 1, padding: "var(--space-7) var(--space-5)" }}>
        <div className="card stack-5" style={{ maxWidth: 720, margin: "0 auto" }}>
          <div>
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
              New workshop
            </span>
            <h2 style={{ marginBottom: 0 }}>Let's build a post.</h2>
          </div>
          <p className="muted" style={{ margin: 0 }}>
            Drop in an idea, a seed, a half-thought, or just hit start and we will figure it out
            together. I will ask before I draft if I need to.
          </p>
          <textarea
            className="field-textarea"
            rows={4}
            placeholder="Optional. The thought you cannot stop having this week."
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
          />
          {error ? (
            <div className="field-error" role="alert">
              {error}
            </div>
          ) : null}
          <button
            className="btn btn-primary"
            onClick={startSession}
            disabled={thinking}
            style={{ alignSelf: "flex-start" }}
          >
            {thinking ? "Starting..." : "Start workshop"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "var(--surface-page)" }}>
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          padding: "var(--space-6) var(--space-5)",
          overflowY: "auto",
        }}
      >
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          {messages.map((m) => {
            if (m.role === "user") {
              return <UserBubble key={m.message_id}>{m.content}</UserBubble>;
            }
            const parsed = parseAssistant(m.content);
            const stance = (m.metadata?.stance as Stance | undefined) ?? "draft";
            const score = (m.metadata?.score as ScoreShape | undefined) ?? null;
            const saved = savedDraftIds[m.message_id];
            return (
              <CoachBubble key={m.message_id}>
                <span
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: "0.16em",
                    textTransform: "uppercase",
                    color: "var(--color-pink)",
                    marginBottom: 8,
                    display: "block",
                  }}
                >
                  {stanceLabel(stance)}
                </span>
                {parsed.message ? (
                  <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{parsed.message}</p>
                ) : null}
                {parsed.draft ? <DraftBody draft={parsed.draft} /> : null}
                {parsed.draft && score ? (
                  <div style={{ marginTop: 10 }}>
                    <InlineScoreBadge score={score} />
                    {score.tradeoff_summary ? (
                      <p
                        style={{
                          margin: "8px 0 0",
                          fontSize: 13,
                          color: "var(--color-pink)",
                          fontWeight: 600,
                        }}
                      >
                        {score.tradeoff_summary}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {parsed.draft ? (
                  <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      className="btn btn-secondary"
                      style={{ padding: "10px 16px", fontSize: 14 }}
                      onClick={() => parsed.draft && void saveDraft(m.message_id, parsed.draft)}
                      disabled={Boolean(saved)}
                    >
                      {saved ? "Saved" : "Save this draft"}
                    </button>
                    <button
                      className="btn btn-ghost"
                      style={{ padding: "10px 16px", fontSize: 14 }}
                      onClick={() => parsed.draft && void navigator.clipboard.writeText(parsed.draft)}
                    >
                      Copy
                    </button>
                  </div>
                ) : null}
                {parsed.draft ? (
                  <FeedbackControls
                    ctx={{
                      surface: "workshop",
                      source_id: workshopId ?? undefined,
                      raw_content_after: parsed.draft,
                      voice_score: score?.voice_score,
                      performance_score: score?.performance_score,
                    }}
                  />
                ) : null}
              </CoachBubble>
            );
          })}
          {thinking ? (
            <CoachBubble>
              <span className="muted">Thinking...</span>
            </CoachBubble>
          ) : null}
        </div>
      </div>
      <div
        style={{
          background: "var(--color-white)",
          borderTop: "1px solid var(--border-soft)",
          padding: 20,
        }}
      >
        <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", gap: 12 }}>
          <textarea
            className="field-textarea"
            rows={2}
            placeholder="Reply, ask for a different hook, share a tweak..."
            value={composing}
            onChange={(e) => setComposing(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void sendMessage();
              }
            }}
            style={{ flex: 1, minHeight: 64 }}
          />
          <button
            className="btn btn-primary"
            onClick={sendMessage}
            disabled={thinking || !composing.trim()}
            style={{ alignSelf: "flex-end" }}
          >
            Send
          </button>
        </div>
        {error ? (
          <div className="field-error" style={{ maxWidth: 760, margin: "8px auto 0", textAlign: "center" }}>
            {error}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function DraftBody({ draft }: { draft: string }) {
  // Split on blank lines so paragraph breaks render as visible spacing,
  // regardless of how `pre-wrap` would have displayed the raw newlines.
  const paragraphs = draft
    .split(/\n[\t ]*\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  return (
    <div
      style={{
        marginTop: 16,
        padding: 18,
        background: "var(--color-off-white)",
        borderLeft: "3px solid var(--color-pink)",
        borderRadius: "var(--radius-md)",
        fontSize: 15.5,
        lineHeight: 1.65,
      }}
    >
      {paragraphs.map((para, i) => (
        <p
          key={i}
          style={{
            margin: 0,
            marginBottom: i === paragraphs.length - 1 ? 0 : 14,
            whiteSpace: "pre-wrap",
          }}
        >
          {para}
        </p>
      ))}
    </div>
  );
}

function parseAssistant(raw: string): StoredAssistantContent {
  try {
    const parsed = JSON.parse(raw) as Partial<StoredAssistantContent>;
    return {
      message: parsed.message ?? "",
      draft: typeof parsed.draft === "string" ? parsed.draft : null,
    };
  } catch {
    return { message: raw, draft: null };
  }
}

function stanceLabel(stance: Stance): string {
  if (stance === "clarify") return "A quick question";
  if (stance === "refine") return "Revised draft";
  return "Draft";
}
