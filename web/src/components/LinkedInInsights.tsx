import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";

type TopPost = {
  post_id: string;
  content_preview: string;
  posted_at: string;
  metric_value: number;
  metric_label: string;
};

type WindowTotals = {
  posts: number;
  impressions: number;
  likes: number;
  comments: number;
  shares: number;
  clicks: number;
};

type Summary = {
  connected: boolean;
  is_demo: boolean;
  last_synced_at: string | null;
  posts_analyzed: number;
  totals: { impressions: number; likes: number; comments: number; shares: number; clicks: number };
  last_30_days: WindowTotals | null;
  last_6_months: WindowTotals | null;
  top_by_impressions: TopPost | null;
  top_by_comments: TopPost | null;
  top_by_likes: TopPost | null;
  insight: string;
  insight_generated_at: string | null;
};

export function LinkedInInsights() {
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void api
      .get<Summary>("/analytics/linkedin-summary")
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <section className="card">
        <div className="muted" style={{ fontSize: 14 }}>
          Loading LinkedIn insights...
        </div>
      </section>
    );
  }

  if (!data) {
    return (
      <section className="card stack-2">
        <span className="field-label">LinkedIn</span>
        <div className="muted" style={{ fontSize: 14 }}>
          We couldn't load your LinkedIn insights right now.
        </div>
      </section>
    );
  }

  if (!data.connected) {
    return (
      <section className="card stack-2">
        <span className="field-label">LinkedIn</span>
        <p style={{ margin: 0, fontSize: 14 }}>
          Connect LinkedIn to unlock pattern analysis from your real post history.
        </p>
        <Link to="/onboarding" className="accent">
          Connect now →
        </Link>
      </section>
    );
  }

  if (data.posts_analyzed === 0) {
    return (
      <section className="card stack-2">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span className="field-label">LinkedIn</span>
          <StatusPill connected demo={data.is_demo} />
        </div>
        <p style={{ margin: 0, fontSize: 14 }}>{data.insight}</p>
      </section>
    );
  }

  return (
    <section className="card stack-4">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <span className="field-label">LinkedIn insights</span>
        <StatusPill connected demo={data.is_demo} lastSynced={data.last_synced_at} />
      </div>

      <div
        style={{
          background: "var(--color-navy)",
          color: "var(--color-white)",
          borderRadius: "var(--radius-md)",
          padding: "14px 16px",
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "var(--color-pink)",
            marginBottom: 4,
          }}
        >
          What PowerPost noticed
        </div>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55 }}>{data.insight}</p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
          gap: 8,
        }}
      >
        <Stat label="Posts" value={data.posts_analyzed} />
        <Stat label="Impressions" value={data.totals.impressions} />
        <Stat label="Reactions" value={data.totals.likes} />
        <Stat label="Comments" value={data.totals.comments} />
        <Stat label="Shares" value={data.totals.shares} />
        {data.totals.clicks > 0 ? <Stat label="Clicks" value={data.totals.clicks} /> : null}
      </div>

      {data.last_30_days || data.last_6_months ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: data.last_30_days && data.last_6_months ? "1fr 1fr" : "1fr",
            gap: 12,
          }}
        >
          {data.last_30_days ? (
            <WindowCard label="Last 30 days" data={data.last_30_days} />
          ) : null}
          {data.last_6_months ? (
            <WindowCard label="Last 6 months" data={data.last_6_months} />
          ) : null}
        </div>
      ) : null}

      <div className="stack-2">
        <span className="field-label">Top posts</span>
        {data.top_by_impressions ? <TopPostCard post={data.top_by_impressions} /> : null}
        {data.top_by_comments ? <TopPostCard post={data.top_by_comments} /> : null}
        {data.top_by_likes ? <TopPostCard post={data.top_by_likes} /> : null}
      </div>
    </section>
  );
}

function StatusPill({
  connected,
  demo,
  lastSynced,
}: {
  connected: boolean;
  demo?: boolean;
  lastSynced?: string | null;
}) {
  return (
    <span
      style={{
        fontFamily: "var(--font-display)",
        fontSize: 11,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        fontWeight: 700,
        color: connected ? "var(--color-pink)" : "var(--text-on-light-muted)",
        whiteSpace: "nowrap",
      }}
      title={lastSynced ? `Last synced ${new Date(lastSynced).toLocaleString()}` : undefined}
    >
      {connected ? (demo ? "Demo · synced" : "Connected") : "Disconnected"}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div
      style={{
        background: "var(--surface-card-soft)",
        borderRadius: "var(--radius-md)",
        padding: "10px 12px",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 10,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--text-on-light-muted)",
          fontWeight: 700,
        }}
      >
        {label}
      </div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 800, marginTop: 2 }}>
        {formatNumber(value)}
      </div>
    </div>
  );
}

function WindowCard({ label, data }: { label: string; data: WindowTotals }) {
  return (
    <div
      style={{
        border: "1px solid var(--border-soft)",
        borderRadius: "var(--radius-md)",
        padding: "10px 14px",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 11,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--text-on-light-muted)",
          fontWeight: 700,
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 13, lineHeight: 1.55 }}>
        <div>
          <strong>{data.posts}</strong> post{data.posts === 1 ? "" : "s"}
        </div>
        <div className="muted">
          {formatNumber(data.impressions)} impressions · {formatNumber(data.likes)} reactions ·{" "}
          {formatNumber(data.comments)} comments · {formatNumber(data.shares)} shares
        </div>
      </div>
    </div>
  );
}

function TopPostCard({ post }: { post: TopPost }) {
  return (
    <div
      style={{
        borderLeft: "3px solid var(--color-pink)",
        background: "var(--color-off-white)",
        padding: "10px 14px",
        borderRadius: "var(--radius-md)",
        fontSize: 13.5,
        lineHeight: 1.55,
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 10,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--color-pink)",
          fontWeight: 700,
          marginBottom: 4,
        }}
      >
        Top by {post.metric_label} · {formatNumber(post.metric_value)}
      </div>
      <div>{post.content_preview}</div>
      <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
        {new Date(post.posted_at).toLocaleDateString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
        })}
      </div>
    </div>
  );
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
