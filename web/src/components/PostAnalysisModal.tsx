import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, api } from "../api/client";
import { ThinkingState } from "./Thinking";

type Post = {
  post_id: string;
  content: string;
  posted_at: string;
  impressions: number;
  likes: number;
  comments: number;
  shares: number;
  clicks: number;
};

type Analysis = {
  post: Post;
  why_it_worked: string;
  voice_traits: string[];
  takeaways: Array<{ idea: string; voice_alignment: string }>;
  standout_metric: string;
  cached: boolean;
  generated_at: string;
};

export function PostAnalysisModal({
  postId,
  onClose,
}: {
  postId: string;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [data, setData] = useState<Analysis | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void api
      .get<Analysis>(`/analytics/posts/${postId}/analysis`)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError) setError(err.message);
        else setError("Could not load analysis");
      });
    return () => {
      cancelled = true;
    };
  }, [postId]);

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function workshopLikeThis() {
    if (!data) return;
    const seedTakeaway = data.takeaways[0]?.idea ?? data.why_it_worked;
    const seed = `Build a new post applying this pattern from a post that worked: ${seedTakeaway}`;
    try {
      sessionStorage.setItem(
        "pp_workshop_seed",
        JSON.stringify({ seed, source_post_id: data.post.post_id }),
      );
    } catch {
      // ignore
    }
    navigate("/workshop");
    onClose();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Post analysis"
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
        style={{
          width: "min(720px, 100%)",
          background: "var(--color-white)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-elevated)",
          padding: 28,
          position: "relative",
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{
            position: "absolute",
            top: 14,
            right: 14,
            border: 0,
            background: "transparent",
            fontSize: 22,
            cursor: "pointer",
            color: "var(--text-on-light-muted)",
            padding: 4,
            lineHeight: 1,
          }}
        >
          ×
        </button>

        {!data && !error ? (
          <ThinkingState
            messages={[
              "Reading the post",
              "Comparing to your other posts",
              "Spotting the pattern that worked",
              "Writing takeaways",
            ]}
          />
        ) : null}

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

        {data ? (
          <div className="stack-5">
            <div>
              <span
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: "var(--color-pink)",
                }}
              >
                Top by {data.standout_metric}
              </span>
              <h2 style={{ marginTop: 4, marginBottom: 4 }}>Why this worked</h2>
              <p
                className="muted"
                style={{ margin: 0, fontSize: 13 }}
              >
                Posted {new Date(data.post.posted_at).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
                {" · "}
                {data.post.impressions} impressions · {data.post.likes} reactions ·{" "}
                {data.post.comments} comments · {data.post.shares} shares
              </p>
            </div>

            <div
              style={{
                background: "var(--color-off-white)",
                borderLeft: "3px solid var(--color-pink)",
                borderRadius: "var(--radius-md)",
                padding: "16px 18px",
                fontSize: 15,
                lineHeight: 1.65,
              }}
            >
              {data.post.content.split(/\n[\t ]*\n+/).map((para, i, arr) => (
                <p
                  key={i}
                  style={{
                    margin: 0,
                    marginBottom: i === arr.length - 1 ? 0 : 12,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {para.trim()}
                </p>
              ))}
            </div>

            {data.why_it_worked ? (
              <section className="stack-2">
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
                  Why this worked
                </span>
                <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55 }}>{data.why_it_worked}</p>
              </section>
            ) : null}

            {data.voice_traits.length > 0 ? (
              <section className="stack-2">
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
                  Voice traits in this post
                </span>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {data.voice_traits.map((t, i) => (
                    <span
                      key={i}
                      style={{
                        padding: "4px 10px",
                        borderRadius: "var(--radius-pill)",
                        background: "var(--surface-card-soft)",
                        fontFamily: "var(--font-display)",
                        fontSize: 12,
                        fontWeight: 600,
                        color: "var(--text-on-light)",
                      }}
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </section>
            ) : null}

            {data.takeaways.length > 0 ? (
              <section className="stack-3">
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
                  What you can carry forward
                </span>
                {data.takeaways.map((t, i) => (
                  <div
                    key={i}
                    style={{
                      border: "1px solid var(--border-soft)",
                      borderRadius: "var(--radius-md)",
                      padding: "12px 14px",
                    }}
                  >
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{t.idea}</p>
                    {t.voice_alignment ? (
                      <p
                        style={{
                          margin: "6px 0 0",
                          fontSize: 13,
                          color: "var(--text-on-light-muted)",
                          fontStyle: "italic",
                        }}
                      >
                        Voice fit: {t.voice_alignment}
                      </p>
                    ) : null}
                  </div>
                ))}
              </section>
            ) : null}

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button className="btn btn-primary" onClick={workshopLikeThis}>
                Workshop a post like this
              </button>
              <button className="btn btn-ghost" onClick={onClose}>
                Close
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
