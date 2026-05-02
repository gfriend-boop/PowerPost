export type ScoreShape = {
  voice_score: number;
  performance_score: number;
  voice_rationale: string;
  performance_rationale: string;
  tradeoff_summary: string | null;
  confidence: "low" | "medium" | "high";
};

export function ScoreCard({
  score,
  selectedKpi,
}: {
  score: ScoreShape;
  selectedKpi?: string;
}) {
  return (
    <div
      style={{
        background: "var(--color-white)",
        border: "1px solid var(--border-soft)",
        borderRadius: "var(--radius-lg)",
        padding: "18px 20px",
        boxShadow: "var(--shadow-card)",
      }}
    >
      <div style={{ display: "flex", gap: 16, alignItems: "stretch", flexWrap: "wrap" }}>
        <ScoreDial label="Voice" value={score.voice_score} />
        <ScoreDial label="Performance" value={score.performance_score} kpi={selectedKpi} />
        <div style={{ flex: 1, minWidth: 240 }}>
          <Rationale label="VOICE RATIONALE" body={score.voice_rationale} />
          <Rationale label="PERFORMANCE RATIONALE" body={score.performance_rationale} />
          {score.tradeoff_summary ? (
            <Rationale label="TRADEOFF" body={score.tradeoff_summary} accent />
          ) : null}
          <ConfidenceTag confidence={score.confidence} />
        </div>
      </div>
    </div>
  );
}

export function InlineScoreBadge({ score }: { score: ScoreShape }) {
  return (
    <div
      style={{
        display: "inline-flex",
        gap: 12,
        padding: "8px 12px",
        borderRadius: "var(--radius-pill)",
        background: "var(--surface-card-soft)",
        fontFamily: "var(--font-display)",
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: "0.06em",
      }}
    >
      <span>
        VOICE <span style={{ color: scoreColor(score.voice_score) }}>{score.voice_score}/10</span>
      </span>
      <span style={{ opacity: 0.4 }}>·</span>
      <span>
        PERF{" "}
        <span style={{ color: scoreColor(score.performance_score) }}>
          {score.performance_score}/10
        </span>
      </span>
    </div>
  );
}

function ScoreDial({
  label,
  value,
  kpi,
}: {
  label: string;
  value: number;
  kpi?: string;
}) {
  const color = scoreColor(value);
  return (
    <div
      style={{
        flex: "0 0 140px",
        background: "var(--color-navy)",
        color: "var(--color-white)",
        borderRadius: "var(--radius-md)",
        padding: "16px 14px",
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 11,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          opacity: 0.78,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 800,
          fontSize: 36,
          color,
          lineHeight: 1.1,
          marginTop: 4,
        }}
      >
        {value}
        <span style={{ fontSize: 18, opacity: 0.6 }}>/10</span>
      </div>
      {kpi ? (
        <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4, textTransform: "uppercase", letterSpacing: "0.1em" }}>
          {kpi.replaceAll("_", " ")}
        </div>
      ) : null}
    </div>
  );
}

function Rationale({
  label,
  body,
  accent,
}: {
  label: string;
  body: string;
  accent?: boolean;
}) {
  if (!body) return null;
  return (
    <div style={{ marginBottom: 10 }}>
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 10,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: accent ? "var(--color-pink)" : "var(--text-on-light-muted)",
          fontWeight: 700,
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 14, lineHeight: 1.5 }}>{body}</div>
    </div>
  );
}

function ConfidenceTag({ confidence }: { confidence: "low" | "medium" | "high" }) {
  const text =
    confidence === "low"
      ? "Provisional. Limited post history to compare against."
      : confidence === "medium"
        ? "Some history used as evidence."
        : "Grounded in your post history.";
  return (
    <div style={{ marginTop: 4, fontSize: 12, color: "var(--text-on-light-muted)" }}>
      {text}
    </div>
  );
}

function scoreColor(value: number): string {
  if (value >= 8) return "#79f7c2";
  if (value >= 6) return "#ffb84a";
  return "#ff8aa7";
}
