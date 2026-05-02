/**
 * Detect Topics to Watch from a user's cached LinkedIn posts.
 *
 * One LLM call. Output is a list of suggested topics with reasons grounded
 * in the user's own posts. Each suggestion is upserted into the
 * watched_topics table with status='suggested' so the user must
 * confirm/dismiss before it influences future Timely idea generation.
 */

import { config } from "../../config.js";
import { pool } from "../../db/pool.js";
import { getLLMClient } from "../llm/anthropic.js";
import { buildPhase2System, loadPromptContext } from "../llm/phase2-prompts.js";
import { parseLooseJson } from "../llm/validators.js";
import {
  listDismissedLabels,
  upsertSuggested,
  type WatchedTopic,
  type WatchedTopicPriority,
} from "./watched-topics.js";

type RawDetected = {
  label?: string;
  reason?: string;
  evidence_count?: number;
  evidence_post_ids?: string[];
  suggested_priority?: string;
  confidence?: number;
};

export async function detectTopicsForUser(userId: string): Promise<{
  suggestions: WatchedTopic[];
  considered_posts: number;
}> {
  const ctx = await loadPromptContext(userId);
  if (!ctx) throw new Error("Voice profile required to detect topics");

  // Pull a workable set of posts. Use top-by-engagement + most-recent so the
  // detector sees both performance and current focus.
  const { rows: posts } = await pool.query<{
    post_id: string;
    content: string;
    posted_at: string;
    impressions: string;
    likes: string;
    comments: string;
    shares: string;
  }>(
    `SELECT post_id, content, posted_at::text,
            impressions::text, likes::text, comments::text, shares::text
       FROM posts
      WHERE user_id = $1
      ORDER BY (likes + comments + shares) DESC, posted_at DESC
      LIMIT 30`,
    [userId],
  );

  if (posts.length < 3) {
    return { suggestions: [], considered_posts: posts.length };
  }

  const dismissed = await listDismissedLabels(userId);
  const topicAuthorities = ctx.profile.topic_authorities ?? [];

  const evidenceBlock = posts
    .map(
      (p, i) =>
        `[#${i + 1} id=${p.post_id}] likes=${p.likes} comments=${p.comments} shares=${p.shares}\n${truncate(p.content, 380)}`,
    )
    .join("\n\n");

  const userPrompt = `Look at this user's recent and top-performing LinkedIn posts. Identify 4 to 7 distinct recurring topics or themes that PowerPost should watch on their behalf.

A good topic is:
- Specific enough to be useful as a search query (e.g. "Leadership communication during layoffs", not "leadership").
- Either appears repeatedly across posts, OR shows up in a top-performing post.
- Lines up with one of the user's topic authorities OR an adjacent area where they have credible angle.

Do NOT suggest:
- Generic categories like "leadership" or "business".
- Anything the user explicitly dismissed before: ${dismissed.length > 0 ? dismissed.join(" | ") : "(none)"}
- Trend-chasing topics with no connection to this user's posts.

User's stated topic authorities: ${topicAuthorities.length > 0 ? topicAuthorities.join(", ") : "(none specified)"}

For each suggested topic include:
- "label": short specific phrase (4-8 words ideal).
- "reason": 1-2 sentences. Reference specific posts by [#N] from the evidence and any pattern (e.g. "appears in 2 of your top 5 most-commented posts").
- "evidence_count": how many evidence posts the topic appears in.
- "evidence_post_ids": the post_id values for the evidence posts.
- "suggested_priority": "high" if it shows up in the user's top performers, otherwise "normal".
- "confidence": 0 to 1.

Return JSON only:
{
  "topics": [
    {
      "label": "<specific phrase>",
      "reason": "<grounded in evidence>",
      "evidence_count": <int>,
      "evidence_post_ids": ["<post_id>", ...],
      "suggested_priority": "high" | "normal",
      "confidence": <0-1>
    }
  ]
}

EVIDENCE POSTS:
${evidenceBlock}`;

  const system = buildPhase2System(ctx);
  const llm = getLLMClient();
  const response = await llm.complete({
    model: config.anthropic.generationModel,
    system,
    messages: [{ role: "user", content: userPrompt }],
    max_tokens: 2000,
    temperature: 0.35,
  });

  const parsed = parseLooseJson<{ topics?: RawDetected[] }>(response.text);
  const suggestions = (parsed?.topics ?? []).filter(Boolean);

  const inserted: WatchedTopic[] = [];
  for (const t of suggestions) {
    if (!t.label || !t.reason) continue;
    const priority: WatchedTopicPriority = t.suggested_priority === "high" ? "high" : "normal";
    const conf = clamp01(t.confidence);
    if (conf < 0.4) continue;
    const topic = await upsertSuggested(userId, {
      label: t.label,
      reason: t.reason,
      evidence_count: Math.max(0, Math.floor(t.evidence_count ?? 0)),
      evidence_post_ids: Array.isArray(t.evidence_post_ids) ? t.evidence_post_ids : [],
      suggested_priority: priority,
      confidence: conf,
      source: "detected_from_posts",
    });
    if (topic) inserted.push(topic);
  }

  return { suggestions: inserted, considered_posts: posts.length };
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n).trimEnd() + "...";
}

function clamp01(n: unknown): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}
