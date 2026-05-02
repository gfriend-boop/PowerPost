import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";

type Alignment = {
  has_data: boolean;
  voice_score_avg: number | null;
  performance_score_avg: number | null;
  voice_trend: number | null;
  performance_trend: number | null;
  drift: "none" | "voice_drift" | "outcome_drift" | "both";
  recommended_action: string;
  trend_points: Array<{ day: string; voice: number; performance: number }>;
  data_points: number;
};

export function AlignmentWidget() {
  const [data, setData] = useState<Alignment | null>(null);
  useEffect(() => {
    void api
      .get<Alignment>("/analytics/alignment")
      .then(setData)
      .catch(() => setData(null));
  }, []);

  if (!data) return null;

  const driftLabel =
    data.drift === "voice_drift"
      ? "Voice drift"
      : data.drift === "outcome_drift"
        ? "Outcome drift"
        : data.drift === "both"
          ? "Drifting on both axes"
          : "Healthy";

  const driftColor =
    data.drift === "none" ? "var(--color-pink)" : data.drift === "both" ? "#c81d6a" : "#ffb84a";

  return (
    <section className="card stack-3" style={{ borderLeft: `4px solid ${driftColor}` }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span className="field-label">Alignment</span>
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: driftColor,
          }}
        >
          {driftLabel}
        </span>
      </div>

      {data.has_data ? (
        <>
          <div style={{ display: "flex", gap: 12 }}>
            <Score
              label="Voice"
              value={data.voice_score_avg}
              trend={data.voice_trend}
            />
            <Score
              label="Performance"
              value={data.performance_score_avg}
              trend={data.performance_trend}
            />
          </div>

          {data.trend_points.length > 1 ? <Sparkline points={data.trend_points} /> : null}

          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55 }}>{data.recommended_action}</p>

          {data.drift !== "none" ? (
            <Link
              to="/voice/edit"
              className="btn btn-ghost"
              style={{ padding: "8px 14px", fontSize: 13, alignSelf: "flex-start" }}
            >
              Recalibrate voice
            </Link>
          ) : null}
        </>
      ) : (
        <p style={{ margin: 0, fontSize: 14 }} className="muted">
          {data.recommended_action}
        </p>
      )}
    </section>
  );
}

function Score({
  label,
  value,
  trend,
}: {
  label: string;
  value: number | null;
  trend: number | null;
}) {
  return (
    <div style={{ flex: 1, padding: "10px 12px", background: "var(--surface-card-soft)", borderRadius: "var(--radius-md)" }}>
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 10,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: "var(--text-on-light-muted)",
          fontWeight: 700,
        }}
      >
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 2 }}>
        <span style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 800 }}>
          {value !== null ? value.toFixed(1) : "—"}
        </span>
        <span style={{ fontSize: 12, color: "var(--text-on-light-muted)" }}>/ 10</span>
        {trend !== null && trend !== 0 ? (
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              marginLeft: "auto",
              color: trend > 0 ? "#0a7a55" : "#c81d6a",
            }}
          >
            {trend > 0 ? "↑" : "↓"} {Math.abs(trend).toFixed(1)}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function Sparkline({
  points,
}: {
  points: Array<{ day: string; voice: number; performance: number }>;
}) {
  const w = 280;
  const h = 48;
  const max = 10;
  const min = 0;
  const step = w / Math.max(1, points.length - 1);
  const project = (val: number, idx: number) => {
    const x = idx * step;
    const y = h - ((val - min) / (max - min)) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  };
  const voiceLine = points.map((p, i) => project(p.voice, i)).join(" ");
  const perfLine = points.map((p, i) => project(p.performance, i)).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} style={{ display: "block" }}>
      <polyline
        fill="none"
        stroke="var(--color-pink)"
        strokeWidth={2}
        points={voiceLine}
      />
      <polyline
        fill="none"
        stroke="var(--color-navy)"
        strokeWidth={2}
        strokeDasharray="4 3"
        points={perfLine}
      />
    </svg>
  );
}
