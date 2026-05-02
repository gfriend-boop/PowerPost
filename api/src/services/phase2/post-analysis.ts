/**
 * "Why this post worked" analysis for a single user post.
 *
 * Generated on demand when the user clicks a top post card. Result is
 * cached on the posts row so repeated clicks don't burn LLM calls.
 */

import { config } from "../../config.js";
import { pool } from "../../db/pool.js";
import { getLLMClient } from "../llm/anthropic.js";
import { buildPhase2System, loadPromptContext } from "../llm/phase2-prompts.js";
import { parseLooseJson } from "../llm/validators.js";

const ANALYSIS_TTL_HOURS = 24;

export type PostAnalysis = {
  post: {
    post_id: string;
    content: string;
    posted_at: string;
    impressions: number;
    likes: number;
    comments: number;
    shares: number;
    clicks: number;
  };
  why_it_worked: string;
  voice_traits: string[];
  takeaways: Array<{
    idea: string;
    voice_alignment: string;
  }>;
  standout_metric: string;
  cached: boolean;
  generated_at: string;
};

type CachedAnalysis = {
  why_it_worked: string;
  voice_traits: string[];
  takeaways: Array<{ idea: string; voice_alignment: string }>;
  standout_metric: string;
};

export async function analysePost(userId: string, postId: string): Promise<PostAnalysis> {
  const { rows } = await pool.query<{
    post_id: string;
    content: string;
    posted_at: string;
    impressions: string;
    likes: string;
    comments: string;
    shares: string;
    clicks: string;
    analysis_text: string | null;
    analysis_generated_at: string | null;
  }>(
    `SELECT post_id, content, posted_at::text,
            impressions::text, likes::text, comments::text, shares::text, clicks::text,
            analysis_text, analysis_generated_at::text
       FROM posts
      WHERE user_id = $1 AND post_id = $2`,
    [userId, postId],
  );
  const row = rows[0];
  if (!row) {
    throw new Error("Post not found");
  }

  const post = {
    post_id: row.post_id,
    content: row.content,
    posted_at: row.posted_at,
    impressions: Number(row.impressions),
    likes: Number(row.likes),
    comments: Number(row.comments),
    shares: Number(row.shares),
    clicks: Number(row.clicks),
  };

  // Use cached analysis when fresh.
  if (
    row.analysis_text &&
    row.analysis_generated_at &&
    Date.now() - Date.parse(row.analysis_generated_at) < ANALYSIS_TTL_HOURS * 60 * 60 * 1000
  ) {
    try {
      const parsed = JSON.parse(row.analysis_text) as CachedAnalysis;
      return {
        post,
        why_it_worked: parsed.why_it_worked,
        voice_traits: parsed.voice_traits ?? [],
        takeaways: parsed.takeaways ?? [],
        standout_metric: parsed.standout_metric,
        cached: true,
        generated_at: row.analysis_generated_at,
      };
    } catch {
      // Fall through to regeneration.
    }
  }

  const ctx = await loadPromptContext(userId);
  if (!ctx) {
    throw new Error("Voice profile required to analyse a post");
  }

  // Pull a few comparison posts (lower-engagement) for context.
  const lowEngagement = (
    await pool.query<{ post_id: string; content: string; impressions: string; likes: string; comments: string; shares: string }>(
      `SELECT post_id, content, impressions::text, likes::text, comments::text, shares::text
         FROM posts
        WHERE user_id = $1 AND post_id <> $2
        ORDER BY (impressions + likes + comments + shares) ASC
        LIMIT 2`,
      [userId, postId],
    )
  ).rows;

  const standout = pickStandoutMetric(post);

  const system = buildPhase2System(ctx);
  const userPrompt = `Analyse a single LinkedIn post that performed well for this user. Tell them honestly why it worked, then give them 2 to 3 specific takeaways they can apply to FUTURE drafts without losing their voice.

Hard rules:
- Be specific. Reference actual phrases, structural choices, openings, or endings in this post.
- Do not invent metrics. Only reference engagement that the data shows.
- Do not give generic advice ("add a hook", "engage your audience"). Name the mechanism.
- No em dashes. No broetry.
- For each takeaway, include a one-sentence "voice alignment" note that says how applying it would or would not respect the user's existing voice profile.
- If the post performed because of factors that are hard to repeat (e.g. timing, a quoted person, a one-off life moment), say so plainly.

Standout metric: ${standout.label} (${standout.value}).
Other metrics on this post: impressions=${post.impressions}, likes=${post.likes}, comments=${post.comments}, shares=${post.shares}, clicks=${post.clicks}.

THE POST (${post.posted_at}):
"""
${post.content}
"""

${
  lowEngagement.length > 0
    ? `LOWER-ENGAGEMENT POSTS FROM THIS USER (for contrast — what they wrote that did not land as well):\n${lowEngagement
        .map(
          (p, i) =>
            `[Lower #${i + 1}] impressions=${p.impressions} likes=${p.likes} comments=${p.comments}\n${p.content.slice(0, 400)}`,
        )
        .join("\n\n")}`
    : ""
}

Return JSON only:
{
  "why_it_worked": "<2 to 4 sentences, specific, references the post>",
  "voice_traits": ["<short trait>", "<short trait>"],
  "takeaways": [
    { "idea": "<concrete one-sentence takeaway>", "voice_alignment": "<one sentence on how this fits or stretches the user's voice>" }
  ],
  "standout_metric": "${standout.label}"
}`;

  const llm = getLLMClient();
  const response = await llm.complete({
    model: config.anthropic.generationModel,
    system,
    messages: [{ role: "user", content: userPrompt }],
    max_tokens: 1200,
    temperature: 0.45,
  });

  const parsed = parseLooseJson<CachedAnalysis>(response.text);
  const analysis: CachedAnalysis = {
    why_it_worked: parsed?.why_it_worked ?? "",
    voice_traits: Array.isArray(parsed?.voice_traits) ? parsed!.voice_traits.slice(0, 5) : [],
    takeaways: Array.isArray(parsed?.takeaways) ? parsed!.takeaways.slice(0, 4) : [],
    standout_metric: parsed?.standout_metric ?? standout.label,
  };

  await pool.query(
    `UPDATE posts SET analysis_text = $3::text, analysis_generated_at = now()
      WHERE user_id = $1 AND post_id = $2`,
    [userId, postId, JSON.stringify(analysis)],
  );

  return {
    post,
    why_it_worked: analysis.why_it_worked,
    voice_traits: analysis.voice_traits,
    takeaways: analysis.takeaways,
    standout_metric: analysis.standout_metric,
    cached: false,
    generated_at: new Date().toISOString(),
  };
}

function pickStandoutMetric(post: {
  impressions: number;
  likes: number;
  comments: number;
  shares: number;
  clicks: number;
}): { label: string; value: number } {
  const candidates: Array<[string, number]> = [
    ["impressions", post.impressions],
    ["comments", post.comments],
    ["reactions", post.likes],
    ["shares", post.shares],
    ["clicks", post.clicks],
  ];
  candidates.sort((a, b) => b[1] - a[1]);
  return { label: candidates[0]![0], value: candidates[0]![1] };
}
