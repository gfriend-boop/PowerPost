import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError, api } from "../api/client";
import { FeedbackControls } from "../components/Feedback";
import { ScoreCard } from "../components/Score";

const KPI_OPTIONS: Array<{ value: Kpi; label: string }> = [
  { value: "impressions", label: "Impressions" },
  { value: "likes", label: "Likes" },
  { value: "comments", label: "Comments" },
  { value: "shares", label: "Shares" },
  { value: "clicks", label: "Clicks" },
  { value: "inbound_leads", label: "Inbound leads" },
  { value: "profile_views", label: "Profile views" },
];

type Kpi =
  | "impressions"
  | "likes"
  | "comments"
  | "shares"
  | "clicks"
  | "inbound_leads"
  | "profile_views";

type Recommendation = {
  recommendation_id: string;
  title: string;
  what_to_change: string;
  why_it_matters: string;
  suggested_replacement_text: string;
  voice_impact: "positive" | "neutral" | "negative";
  performance_impact: "positive" | "neutral" | "negative";
  evidence_post_id: string | null;
  status: "pending" | "accepted" | "rejected";
};

type Path = {
  path_type: "voice" | "performance" | "balanced";
  summary: string;
  recommendations: Recommendation[];
};

type Session = {
  suggestion_id: string;
  user_id: string;
  original_draft: string;
  selected_kpi: Kpi | null;
  voice_score_before: number;
  performance_score_before: number;
  paths: Path[];
  tradeoff_summary: string;
  working_draft: string;
  final_draft: string | null;
  status: "open" | "finalized" | "discarded";
};

type OptimizeResult = {
  optimized_draft: string;
  what_changed: string;
  voice_score_estimate: number;
  performance_score_estimate: number;
  tradeoff_summary: string;
};

export function ImproveDraft() {
  const params = useParams<{ id?: string }>();
  const navigate = useNavigate();

  const [draft, setDraft] = useState("");
  const [kpi, setKpi] = useState<Kpi>("comments");
  const [analyzing, setAnalyzing] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [optimizing, setOptimizing] = useState<string | null>(null);
  const [optimizeResult, setOptimizeResult] = useState<OptimizeResult | null>(null);
  const [finalizing, setFinalizing] = useState(false);

  useEffect(() => {
    if (params.id) {
      void api
        .get<{ session: Session }>(`/content/improve/${params.id}`)
        .then((r) => {
          setSession(r.session);
          setDraft(r.session.original_draft);
          if (r.session.selected_kpi) setKpi(r.session.selected_kpi);
        })
        .catch(() => setError("Could not load improvement session"));
    }
  }, [params.id]);

  const score = useMemo(() => {
    if (!session) return null;
    return {
      voice_score: session.voice_score_before,
      performance_score: session.performance_score_before,
      voice_rationale: session.tradeoff_summary || "",
      performance_rationale: "",
      tradeoff_summary: session.tradeoff_summary || null,
      confidence: "medium" as const,
    };
  }, [session]);

  async function analyze() {
    setAnalyzing(true);
    setError(null);
    setOptimizeResult(null);
    try {
      const res = await api.post<{ session: Session }>("/content/improve", {
        draft_content: draft,
        selected_kpi: kpi,
      });
      setSession(res.session);
      navigate(`/improve/${res.session.suggestion_id}`, { replace: true });
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError("Could not analyse draft");
    } finally {
      setAnalyzing(false);
    }
  }

  async function setRecStatus(rec: Recommendation, status: "accepted" | "rejected") {
    if (!session) return;
    try {
      const res = await api.patch<{ session: Session }>(
        `/content/improve/${session.suggestion_id}/recommendation/${rec.recommendation_id}`,
        { status },
      );
      setSession(res.session);

      // Implicit feedback event so the learned-prefs extractor sees it.
      void api
        .post("/feedback/events", {
          surface: "improve_draft",
          event_type: status === "accepted" ? "suggestion_accepted" : "suggestion_rejected",
          source_id: session.suggestion_id,
          raw_content_before: rec.what_to_change,
          raw_content_after: rec.suggested_replacement_text,
          selected_kpi: kpi,
          metadata: { recommendation_title: rec.title, path_types: session.paths.map((p) => p.path_type) },
        })
        .catch(() => {});
    } catch {
      // ignore
    }
  }

  async function acceptAll(pathType?: Path["path_type"]) {
    if (!session) return;
    try {
      const res = await api.post<{ session: Session }>(
        `/content/improve/${session.suggestion_id}/accept-all`,
        pathType ? { path_type: pathType } : {},
      );
      setSession(res.session);
      void api
        .post("/feedback/events", {
          surface: "improve_draft",
          event_type: "suggestion_accept_all",
          source_id: session.suggestion_id,
          metadata: { path_type: pathType ?? "all" },
        })
        .catch(() => {});
    } catch {
      // ignore
    }
  }

  async function optimize(target: "voice" | "performance" | "balanced") {
    if (!session) return;
    setOptimizing(target);
    setError(null);
    try {
      const res = await api.post<{ result: OptimizeResult }>("/content/optimize", {
        draft_content: session.working_draft,
        target,
        selected_kpi: kpi,
      });
      setOptimizeResult(res.result);
      void api
        .post("/feedback/events", {
          surface: "improve_draft",
          event_type: "optimization_requested",
          source_id: session.suggestion_id,
          raw_content_before: session.working_draft,
          raw_content_after: res.result.optimized_draft,
          selected_kpi: kpi,
          metadata: { target },
        })
        .catch(() => {});
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError("Could not optimize");
    } finally {
      setOptimizing(null);
    }
  }

  async function finalize() {
    if (!session) return;
    setFinalizing(true);
    try {
      const final = optimizeResult?.optimized_draft ?? session.working_draft;
      const res = await api.post<{ session: Session }>(
        `/content/improve/${session.suggestion_id}/finalize`,
        { draft: final },
      );
      setSession(res.session);
      void api
        .post("/feedback/events", {
          surface: "improve_draft",
          event_type: "draft_finalized",
          source_id: session.suggestion_id,
          raw_content_after: final,
          selected_kpi: kpi,
        })
        .catch(() => {});
    } finally {
      setFinalizing(false);
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
            Improve my draft
          </span>
        </div>

        <h1 style={{ marginBottom: 4 }}>
          Sharpen <span className="accent">a draft you already have</span>.
        </h1>
        <p className="muted" style={{ marginBottom: 24 }}>
          Paste a draft. Pick what you actually want it to do. Get voice-aligned and
          performance-aligned recommendations grounded in your own posts.
        </p>

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

        <section className="card stack-4" style={{ marginBottom: 24 }}>
          <label className="field">
            <span className="field-label">Your draft</span>
            <textarea
              className="field-textarea"
              rows={10}
              placeholder="Paste a LinkedIn post you've been working on..."
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={Boolean(session)}
            />
          </label>

          <label className="field">
            <span className="field-label">Optimize for</span>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {KPI_OPTIONS.map((opt) => {
                const active = kpi === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setKpi(opt.value)}
                    style={{
                      padding: "8px 14px",
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
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </label>

          <button
            className="btn btn-primary"
            disabled={!draft.trim() || analyzing || Boolean(session)}
            onClick={analyze}
            style={{ alignSelf: "flex-start" }}
          >
            {analyzing ? "Analysing..." : session ? "Analysis ready below" : "Analyze"}
          </button>
        </section>

        {session && score ? (
          <>
            <section style={{ marginBottom: 24 }}>
              <ScoreCard score={score} selectedKpi={kpi} />
            </section>

            {session.tradeoff_summary ? (
              <section
                className="card"
                style={{
                  background: "var(--color-navy)",
                  color: "var(--color-white)",
                  marginBottom: 24,
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
                    marginBottom: 6,
                  }}
                >
                  Tradeoff
                </div>
                <p style={{ margin: 0, lineHeight: 1.55 }}>{session.tradeoff_summary}</p>
              </section>
            ) : null}

            {session.paths.map((path) => (
              <section key={path.path_type} className="card stack-3" style={{ marginBottom: 24 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h2 style={{ margin: 0 }}>
                    {path.path_type === "voice"
                      ? "Voice-aligned path"
                      : path.path_type === "performance"
                        ? "Performance-aligned path"
                        : "Balanced path"}
                  </h2>
                  {path.recommendations.some((r) => r.status === "pending") ? (
                    <button
                      className="btn btn-ghost"
                      style={{ padding: "8px 14px", fontSize: 13 }}
                      onClick={() => acceptAll(path.path_type)}
                    >
                      Accept all in this path
                    </button>
                  ) : null}
                </div>
                {path.summary ? <p className="muted" style={{ margin: 0 }}>{path.summary}</p> : null}

                {path.recommendations.length === 0 ? (
                  <p className="muted" style={{ margin: 0 }}>No recommendations on this path.</p>
                ) : (
                  <div className="stack-3">
                    {path.recommendations.map((rec) => (
                      <RecommendationCard
                        key={rec.recommendation_id}
                        rec={rec}
                        onAccept={() => setRecStatus(rec, "accepted")}
                        onReject={() => setRecStatus(rec, "rejected")}
                      />
                    ))}
                  </div>
                )}
              </section>
            ))}

            <section className="card stack-4" style={{ marginBottom: 24 }}>
              <h2 style={{ margin: 0 }}>Working draft</h2>
              <textarea
                className="field-textarea"
                rows={10}
                value={optimizeResult?.optimized_draft ?? session.working_draft}
                onChange={(e) => {
                  const v = e.target.value;
                  setSession({ ...session, working_draft: v });
                  setOptimizeResult(null);
                }}
              />

              <div className="stack-2">
                <span className="field-label">Or have PowerPost optimise the working draft</span>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    className="btn btn-ghost"
                    onClick={() => optimize("voice")}
                    disabled={Boolean(optimizing)}
                  >
                    {optimizing === "voice" ? "Optimising..." : "Optimise for voice"}
                  </button>
                  <button
                    className="btn btn-ghost"
                    onClick={() => optimize("performance")}
                    disabled={Boolean(optimizing)}
                  >
                    {optimizing === "performance" ? "Optimising..." : "Optimise for performance"}
                  </button>
                  <button
                    className="btn btn-ghost"
                    onClick={() => optimize("balanced")}
                    disabled={Boolean(optimizing)}
                  >
                    {optimizing === "balanced" ? "Optimising..." : "Balance both"}
                  </button>
                </div>
                {optimizeResult ? (
                  <div
                    style={{
                      background: "var(--color-off-white)",
                      borderLeft: "3px solid var(--color-pink)",
                      borderRadius: "var(--radius-md)",
                      padding: "12px 16px",
                      marginTop: 8,
                      fontSize: 14,
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
                      What changed
                    </div>
                    <p style={{ margin: 0 }}>{optimizeResult.what_changed}</p>
                    {optimizeResult.tradeoff_summary ? (
                      <p style={{ marginTop: 8, marginBottom: 0, color: "var(--color-pink)" }}>
                        {optimizeResult.tradeoff_summary}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button className="btn btn-primary" onClick={finalize} disabled={finalizing}>
                  {finalizing ? "Saving..." : "Finalise this draft"}
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={() =>
                    void navigator.clipboard.writeText(
                      optimizeResult?.optimized_draft ?? session.working_draft,
                    )
                  }
                >
                  Copy to clipboard
                </button>
              </div>

              <FeedbackControls
                ctx={{
                  surface: "improve_draft",
                  source_id: session.suggestion_id,
                  raw_content_after: optimizeResult?.optimized_draft ?? session.working_draft,
                  selected_kpi: kpi,
                  voice_score: optimizeResult?.voice_score_estimate ?? session.voice_score_before,
                  performance_score:
                    optimizeResult?.performance_score_estimate ?? session.performance_score_before,
                }}
              />
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
}

function RecommendationCard({
  rec,
  onAccept,
  onReject,
}: {
  rec: Recommendation;
  onAccept: () => void;
  onReject: () => void;
}) {
  const accepted = rec.status === "accepted";
  const rejected = rec.status === "rejected";
  return (
    <div
      style={{
        border: accepted
          ? "2px solid var(--color-pink)"
          : rejected
            ? "1.5px dashed var(--border-soft)"
            : "1.5px solid var(--border-soft)",
        borderRadius: "var(--radius-md)",
        padding: 16,
        background: rejected ? "transparent" : "var(--color-white)",
        opacity: rejected ? 0.55 : 1,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>{rec.title}</h3>
        <div style={{ display: "flex", gap: 6 }}>
          <ImpactTag label="Voice" impact={rec.voice_impact} />
          <ImpactTag label="Performance" impact={rec.performance_impact} />
        </div>
      </div>
      {rec.what_to_change ? (
        <p style={{ margin: "10px 0 4px", fontSize: 14 }}>{rec.what_to_change}</p>
      ) : null}
      <p style={{ margin: 0, fontSize: 13, color: "var(--text-on-light-muted)" }}>{rec.why_it_matters}</p>
      {rec.suggested_replacement_text ? (
        <div
          style={{
            marginTop: 10,
            background: "var(--color-off-white)",
            borderLeft: "3px solid var(--color-pink)",
            borderRadius: "var(--radius-sm)",
            padding: "10px 14px",
            whiteSpace: "pre-wrap",
            fontSize: 14,
          }}
        >
          {rec.suggested_replacement_text}
        </div>
      ) : null}
      <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
        <button
          className="btn btn-primary"
          style={{ padding: "8px 14px", fontSize: 13 }}
          onClick={onAccept}
          disabled={accepted}
        >
          {accepted ? "Accepted" : "Accept"}
        </button>
        <button
          className="btn btn-ghost"
          style={{ padding: "8px 14px", fontSize: 13 }}
          onClick={onReject}
          disabled={rejected}
        >
          {rejected ? "Rejected" : "Reject"}
        </button>
      </div>
    </div>
  );
}

function ImpactTag({
  label,
  impact,
}: {
  label: string;
  impact: "positive" | "neutral" | "negative";
}) {
  const color =
    impact === "positive" ? "#0a7a55" : impact === "negative" ? "#c81d6a" : "var(--text-on-light-muted)";
  return (
    <span
      style={{
        fontFamily: "var(--font-display)",
        fontSize: 10,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        fontWeight: 700,
        padding: "4px 8px",
        borderRadius: "var(--radius-pill)",
        background: "rgba(11, 16, 36, 0.04)",
        color,
        whiteSpace: "nowrap",
      }}
    >
      {label} {impact}
    </span>
  );
}
