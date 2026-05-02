import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { CoachBubble, UserBubble } from "../components/ChatBubble";
import { FeedbackControls } from "../components/Feedback";
import { InlineScoreBadge, type ScoreShape } from "../components/Score";
import { ThinkingState } from "../components/Thinking";

type Stance = "clarify" | "draft" | "refine";

type StoredAssistantContent = { message: string; draft: string | null };

type PostGoal =
  | "just_sound_like_me"
  | "start_a_conversation"
  | "get_more_reach"
  | "attract_leads"
  | "build_authority"
  | "share_a_personal_story"
  | "challenge_a_belief"
  | "teach_something";

const POST_GOAL_OPTIONS: Array<{ value: PostGoal; label: string; hint: string }> = [
  { value: "just_sound_like_me", label: "Just sound like me", hint: "Voice fidelity over engagement." },
  { value: "start_a_conversation", label: "Start a conversation", hint: "Real comments, not vanity likes." },
  { value: "get_more_reach", label: "Get more reach", hint: "Travel further in the feed." },
  { value: "attract_leads", label: "Attract leads", hint: "Make the right reader want to talk." },
  { value: "build_authority", label: "Build authority", hint: "Show a sharp take." },
  { value: "share_a_personal_story", label: "Share a personal story", hint: "A specific moment from you." },
  { value: "challenge_a_belief", label: "Challenge a common belief", hint: "Disagree with something popular." },
  { value: "teach_something", label: "Teach something useful", hint: "One applicable idea." },
];

const POST_GOAL_LABEL_BY_VALUE = Object.fromEntries(
  POST_GOAL_OPTIONS.map((o) => [o.value, o.label]),
) as Record<PostGoal, string>;

type WorkshopMessage = {
  message_id: string;
  role: "user" | "assistant";
  content: string; // raw stored
  metadata: Record<string, unknown>;
  created_at: string;
};

type WorkshopSessionInfo = {
  workshop_id: string;
  title: string;
  status: string;
  post_goal: PostGoal | null;
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
  const [postGoal, setPostGoal] = useState<PostGoal | null>(null);
  const [session, setSession] = useState<WorkshopSessionInfo | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setWorkshopId(params.id ?? null);
  }, [params.id]);

  useEffect(() => {
    if (!workshopId) return;
    void api
      .get<{ session: WorkshopSessionInfo; messages: WorkshopMessage[] }>(`/workshop/${workshopId}`)
      .then((res) => {
        setMessages(res.messages);
        setSession(res.session);
      })
      .catch(() => {
        setError("Could not load this workshop session.");
      });
  }, [workshopId]);

  // If the user clicked "Workshop a post like this" from the LinkedIn insights
  // modal, the seed text is waiting in sessionStorage. Drop it into the seed
  // textarea on the start screen so they don't have to retype it.
  useEffect(() => {
    if (workshopId) return;
    try {
      const raw = sessionStorage.getItem("pp_workshop_seed");
      if (raw) {
        const parsed = JSON.parse(raw) as { seed?: string };
        if (parsed.seed) setSeed(parsed.seed);
        sessionStorage.removeItem("pp_workshop_seed");
      }
    } catch {
      // ignore
    }
  }, [workshopId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, thinking]);

  const startSession = async () => {
    if (!postGoal) {
      setError("Pick a goal for the post first.");
      return;
    }
    setThinking(true);
    setError(null);
    try {
      const body: Record<string, string> = { post_goal: postGoal };
      if (seed.trim()) body.seed = seed.trim();
      const res = await api.post<{ workshop_id: string; reply: WorkshopReply }>(
        "/workshop/start",
        body,
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
            <h2 style={{ marginBottom: 0 }}>What do you want this post to do?</h2>
          </div>
          <p className="muted" style={{ margin: 0 }}>
            Pick the goal that matters most. We'll let it shape the draft and the rationale you
            see afterwards.
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: 8,
            }}
          >
            {POST_GOAL_OPTIONS.map((opt) => {
              const active = postGoal === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setPostGoal(opt.value)}
                  style={{
                    textAlign: "left",
                    padding: "12px 14px",
                    borderRadius: "var(--radius-md)",
                    border: active
                      ? "2px solid var(--color-pink)"
                      : "1.5px solid var(--border-soft)",
                    background: active ? "var(--color-navy)" : "var(--color-white)",
                    color: active ? "var(--color-white)" : "var(--text-on-light)",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    transition: "background 0.15s ease, color 0.15s ease",
                  }}
                >
                  <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14 }}>
                    {opt.label}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      marginTop: 2,
                      color: active
                        ? "rgba(255,255,255,0.78)"
                        : "var(--text-on-light-muted)",
                    }}
                  >
                    {opt.hint}
                  </div>
                </button>
              );
            })}
          </div>

          <label className="field">
            <span className="field-label">Optional context</span>
            <textarea
              className="field-textarea"
              rows={4}
              placeholder="The thought you can't stop having this week. Or leave blank and we'll find one."
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
            />
          </label>

          {error ? (
            <div className="field-error" role="alert">
              {error}
            </div>
          ) : null}

          {thinking ? (
            <ThinkingState
              messages={[
                "Reading your voice profile",
                "Checking what worked for you",
                "Picking a stance for the first turn",
                "Drafting in your style",
              ]}
            />
          ) : (
            <button
              className="btn btn-primary"
              onClick={startSession}
              disabled={!postGoal}
              style={{ alignSelf: "flex-start" }}
            >
              Start workshop
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "var(--surface-page)" }}>
      {session ? (
        <SessionGoalBar
          session={session}
          onChange={async (goal) => {
            const res = await api.patch<{ session: WorkshopSessionInfo }>(
              `/workshop/${session.workshop_id}`,
              { post_goal: goal },
            );
            setSession(res.session);
          }}
        />
      ) : null}
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
                      className="btn btn-primary"
                      style={{ padding: "10px 16px", fontSize: 14 }}
                      onClick={() => {
                        if (!parsed.draft) return;
                        try {
                          sessionStorage.setItem(
                            "pp_improve_handoff",
                            JSON.stringify({
                              draft: parsed.draft,
                              workshop_id: workshopId,
                              source: "workshop",
                            }),
                          );
                        } catch {
                          // ignore
                        }
                        navigate("/improve");
                      }}
                    >
                      Improve this draft
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
              <ThinkingState
                variant="bubble"
                messages={[
                  "Reading your voice profile",
                  "Checking your past post patterns",
                  "Looking for the voice / performance tension",
                  "Drafting in your style",
                  "Tightening the recommendation",
                ]}
              />
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

/**
 * Top-bar goal control. Always renders (with either the active goal as a
 * clickable chip, or "Pick a goal" when none is set). Clicking opens a
 * modal-style picker that PATCHes the session post_goal. The next workshop
 * turn picks up the change because runWorkshopTurn reads post_goal fresh
 * from the DB on every turn.
 */
function SessionGoalBar({
  session,
  onChange,
}: {
  session: WorkshopSessionInfo;
  onChange: (goal: PostGoal | null) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const currentLabel = session.post_goal ? POST_GOAL_LABEL_BY_VALUE[session.post_goal] : null;

  const pick = async (goal: PostGoal | null) => {
    setSaving(true);
    try {
      await onChange(goal);
      setOpen(false);
    } catch {
      // ignore — keep popover open so the user can retry
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        background: "var(--color-white)",
        borderBottom: "1px solid var(--border-soft)",
        padding: "10px 20px",
      }}
    >
      <div
        style={{
          maxWidth: 760,
          margin: "0 auto",
          display: "flex",
          alignItems: "center",
          gap: 10,
          fontSize: 13,
        }}
      >
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
          Goal
        </span>
        {currentLabel ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            style={{
              padding: "4px 12px",
              borderRadius: "var(--radius-pill)",
              background: "var(--color-pink)",
              color: "var(--color-white)",
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: 12,
              letterSpacing: "0.04em",
              border: 0,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {currentLabel}
            <span style={{ opacity: 0.78, fontSize: 10 }}>▾</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            style={{
              padding: "4px 12px",
              borderRadius: "var(--radius-pill)",
              background: "transparent",
              color: "var(--color-pink)",
              border: "1.5px dashed var(--color-pink)",
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: 12,
              letterSpacing: "0.04em",
              cursor: "pointer",
            }}
          >
            Pick a goal →
          </button>
        )}
        {currentLabel ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            style={{
              border: 0,
              background: "transparent",
              color: "var(--color-pink)",
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: 11,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              cursor: "pointer",
              padding: 0,
            }}
          >
            Change
          </button>
        ) : null}
      </div>

      {open ? (
        <GoalPickerModal
          current={session.post_goal}
          saving={saving}
          onClose={() => setOpen(false)}
          onPick={pick}
        />
      ) : null}
    </div>
  );
}

function GoalPickerModal({
  current,
  saving,
  onClose,
  onPick,
}: {
  current: PostGoal | null;
  saving: boolean;
  onClose: () => void;
  onPick: (goal: PostGoal | null) => void;
}) {
  // Esc to close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Pick a goal"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(11, 16, 36, 0.62)",
        zIndex: 30,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "60px 20px",
        overflowY: "auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card stack-4"
        style={{
          width: "min(640px, 100%)",
          padding: 28,
        }}
      >
        <div>
          <h2 style={{ marginBottom: 4 }}>What do you want this post to do?</h2>
          <p className="muted" style={{ margin: 0 }}>
            Pick a goal to shape the next draft. You can change this any time.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 8,
          }}
        >
          {POST_GOAL_OPTIONS.map((opt) => {
            const active = current === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onPick(opt.value)}
                disabled={saving}
                style={{
                  textAlign: "left",
                  padding: "12px 14px",
                  borderRadius: "var(--radius-md)",
                  border: active
                    ? "2px solid var(--color-pink)"
                    : "1.5px solid var(--border-soft)",
                  background: active ? "var(--color-navy)" : "var(--color-white)",
                  color: active ? "var(--color-white)" : "var(--text-on-light)",
                  cursor: saving ? "wait" : "pointer",
                  fontFamily: "inherit",
                  transition: "background 0.15s ease, color 0.15s ease",
                  opacity: saving && !active ? 0.6 : 1,
                }}
              >
                <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14 }}>
                  {opt.label}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    marginTop: 2,
                    color: active
                      ? "rgba(255,255,255,0.78)"
                      : "var(--text-on-light-muted)",
                  }}
                >
                  {opt.hint}
                </div>
              </button>
            );
          })}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          {current ? (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => onPick(null)}
              disabled={saving}
              style={{ padding: "8px 14px", fontSize: 13 }}
            >
              Clear goal
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onClose}
            disabled={saving}
            style={{ padding: "8px 14px", fontSize: 13 }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
