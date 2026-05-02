/**
 * LinkedIn dashboard summary.
 *
 * Aggregates cached posts from Unipile into headline metrics + top-post
 * picks across a few engagement axes, then asks Claude for a one or two
 * sentence "What PowerPost noticed" coaching line. The insight is cached on
 * the linkedin_accounts row so we don't burn an LLM call on every dashboard
 * page load.
 */

import { config } from "../../config.js";
import { pool } from "../../db/pool.js";
import { getLLMClient } from "../llm/anthropic.js";
import { buildPhase2System, loadPromptContext } from "../llm/phase2-prompts.js";
import { parseLooseJson } from "../llm/validators.js";

const INSIGHT_TTL_HOURS = 24;

export type TopPostSummary = {
  post_id: string;
  content_preview: string;
  posted_at: string;
  metric_value: number;
  metric_label: string;
};

export type LinkedInSummary = {
  connected: boolean;
  is_demo: boolean;
  last_synced_at: string | null;
  posts_analyzed: number;
  totals: {
    impressions: number;
    likes: number;
    comments: number;
    shares: number;
    clicks: number;
  };
  last_30_days: {
    posts: number;
    impressions: number;
    likes: number;
    comments: number;
    shares: number;
    clicks: number;
  } | null;
  last_6_months: {
    posts: number;
    impressions: number;
    likes: number;
    comments: number;
    shares: number;
    clicks: number;
  } | null;
  top_by_impressions: TopPostSummary | null;
  top_by_comments: TopPostSummary | null;
  top_by_likes: TopPostSummary | null;
  insight: string;
  insight_generated_at: string | null;
};

export async function getLinkedInSummary(userId: string): Promise<LinkedInSummary> {
  const accountRow = (
    await pool.query<{
      last_synced_at: string | null;
      is_demo: boolean;
      insight_text: string | null;
      insight_generated_at: string | null;
    }>(
      `SELECT last_synced_at::text AS last_synced_at, is_demo, insight_text,
              insight_generated_at::text AS insight_generated_at
         FROM linkedin_accounts WHERE user_id = $1`,
      [userId],
    )
  ).rows[0];

  if (!accountRow) {
    return emptySummary({ connected: false, is_demo: false });
  }

  const posts = (
    await pool.query<{
      post_id: string;
      content: string;
      posted_at: string;
      impressions: string;
      likes: string;
      comments: string;
      shares: string;
      clicks: string;
    }>(
      `SELECT post_id, content, posted_at::text,
              impressions::text, likes::text, comments::text, shares::text, clicks::text
         FROM posts WHERE user_id = $1`,
      [userId],
    )
  ).rows;

  if (posts.length === 0) {
    return {
      ...emptySummary({ connected: true, is_demo: accountRow.is_demo }),
      last_synced_at: accountRow.last_synced_at,
    };
  }

  const totals = posts.reduce(
    (acc, p) => ({
      impressions: acc.impressions + Number(p.impressions),
      likes: acc.likes + Number(p.likes),
      comments: acc.comments + Number(p.comments),
      shares: acc.shares + Number(p.shares),
      clicks: acc.clicks + Number(p.clicks),
    }),
    { impressions: 0, likes: 0, comments: 0, shares: 0, clicks: 0 },
  );

  const now = Date.now();
  const day30 = now - 30 * 24 * 60 * 60 * 1000;
  const day180 = now - 180 * 24 * 60 * 60 * 1000;

  const within = (cutoff: number) =>
    posts.filter((p) => Date.parse(p.posted_at) >= cutoff);

  const totalsFor = (rows: typeof posts) =>
    rows.reduce(
      (acc, p) => ({
        posts: acc.posts + 1,
        impressions: acc.impressions + Number(p.impressions),
        likes: acc.likes + Number(p.likes),
        comments: acc.comments + Number(p.comments),
        shares: acc.shares + Number(p.shares),
        clicks: acc.clicks + Number(p.clicks),
      }),
      { posts: 0, impressions: 0, likes: 0, comments: 0, shares: 0, clicks: 0 },
    );

  const recent30 = within(day30);
  const recent180 = within(day180);

  const top = (label: keyof typeof totals, displayLabel: string): TopPostSummary | null => {
    if (posts.length === 0) return null;
    const sorted = [...posts].sort((a, b) => Number(b[label]) - Number(a[label]));
    const winner = sorted[0]!;
    const value = Number(winner[label]);
    if (value === 0) return null;
    return {
      post_id: winner.post_id,
      content_preview: preview(winner.content),
      posted_at: winner.posted_at,
      metric_value: value,
      metric_label: displayLabel,
    };
  };

  const insightText = await ensureInsight(
    userId,
    accountRow.insight_text,
    accountRow.insight_generated_at,
    posts,
    totals,
  );

  return {
    connected: true,
    is_demo: accountRow.is_demo,
    last_synced_at: accountRow.last_synced_at,
    posts_analyzed: posts.length,
    totals,
    last_30_days: recent30.length > 0 ? totalsFor(recent30) : null,
    last_6_months: recent180.length > 0 ? totalsFor(recent180) : null,
    top_by_impressions: top("impressions", "impressions"),
    top_by_comments: top("comments", "comments"),
    top_by_likes: top("likes", "reactions"),
    insight: insightText.insight,
    insight_generated_at: insightText.generated_at,
  };
}

async function ensureInsight(
  userId: string,
  cachedText: string | null,
  cachedAt: string | null,
  posts: Array<{ post_id: string; content: string; posted_at: string; impressions: string; likes: string; comments: string; shares: string; clicks: string }>,
  totals: { impressions: number; likes: number; comments: number; shares: number; clicks: number },
): Promise<{ insight: string; generated_at: string | null }> {
  const cacheStillFresh =
    cachedText &&
    cachedAt &&
    Date.now() - Date.parse(cachedAt) < INSIGHT_TTL_HOURS * 60 * 60 * 1000;
  if (cacheStillFresh) {
    return { insight: cachedText, generated_at: cachedAt };
  }

  if (posts.length < 3) {
    return {
      insight:
        "Not enough post history yet. PowerPost will start spotting patterns once we have a few posts to analyze.",
      generated_at: null,
    };
  }

  // Build a compact post evidence block for the insight prompt.
  const ranked = [...posts].sort(
    (a, b) =>
      Number(b.likes) + Number(b.comments) + Number(b.shares) -
      (Number(a.likes) + Number(a.comments) + Number(a.shares)),
  );
  const topThree = ranked.slice(0, 3);
  const bottomTwo = ranked.slice(-2);

  const evidenceLines = [
    "Top by engagement:",
    ...topThree.map(
      (p) =>
        `  - id=${p.post_id} likes=${p.likes} comments=${p.comments} shares=${p.shares} impressions=${p.impressions}\n    ${preview(p.content, 220)}`,
    ),
    "Lower-engagement examples:",
    ...bottomTwo.map(
      (p) =>
        `  - id=${p.post_id} likes=${p.likes} comments=${p.comments} shares=${p.shares} impressions=${p.impressions}\n    ${preview(p.content, 220)}`,
    ),
    `Totals across ${posts.length} posts: impressions=${totals.impressions} likes=${totals.likes} comments=${totals.comments} shares=${totals.shares}.`,
  ].join("\n");

  const ctx = await loadPromptContext(userId);
  if (!ctx) {
    return {
      insight: "Connect your voice profile to unlock personalised pattern analysis.",
      generated_at: null,
    };
  }

  const system = buildPhase2System(ctx);
  const userPrompt = `Look at the user's LinkedIn post history below. In one or two sentences, write a single direct PowerSpeak-style observation about a real performance pattern.

Rules:
- Pick the most interesting tension or pattern, not the most flattering line. If high-comment posts and high-reach posts have different traits, name that gap. If a topic clearly outperforms another, say so. If the user has a stylistic habit that helps or hurts engagement, name that.
- Be specific. Reference traits from real posts. Avoid "your engagement metrics" or "you have a strong presence" framing.
- No em dashes. No broetry. No generic LinkedIn coach phrasing.
- Do not list metrics. Speak like a coach who already read everything.

Return JSON only:
{ "insight": "<one or two sentences>" }

EVIDENCE:
${evidenceLines}`;

  const llm = getLLMClient();
  const response = await llm.complete({
    model: config.anthropic.generationModel,
    system,
    messages: [{ role: "user", content: userPrompt }],
    max_tokens: 400,
    temperature: 0.5,
  });

  const parsed = parseLooseJson<{ insight?: string }>(response.text);
  let insight =
    (parsed?.insight ?? response.text).trim().replace(/[—\u2014\u2013]/g, ".").replace(/\s{2,}/g, " ");
  if (!insight || insight.length < 12) {
    insight =
      "PowerPost is still warming up on your patterns. Score a couple of drafts and the insight will get sharper.";
  }

  await pool.query(
    `UPDATE linkedin_accounts
        SET insight_text = $2, insight_generated_at = now()
      WHERE user_id = $1`,
    [userId, insight],
  );

  return { insight, generated_at: new Date().toISOString() };
}

function preview(content: string, n = 140): string {
  const single = content.replace(/\s+/g, " ").trim();
  return single.length > n ? `${single.slice(0, n).trimEnd()}...` : single;
}

function emptySummary(args: { connected: boolean; is_demo: boolean }): LinkedInSummary {
  return {
    connected: args.connected,
    is_demo: args.is_demo,
    last_synced_at: null,
    posts_analyzed: 0,
    totals: { impressions: 0, likes: 0, comments: 0, shares: 0, clicks: 0 },
    last_30_days: null,
    last_6_months: null,
    top_by_impressions: null,
    top_by_comments: null,
    top_by_likes: null,
    insight: args.connected
      ? "Not enough post history yet. PowerPost will start spotting patterns once we have a few posts to analyze."
      : "Connect LinkedIn to unlock pattern analysis from your real post history.",
    insight_generated_at: null,
  };
}
