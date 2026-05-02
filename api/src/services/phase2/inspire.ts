/**
 * Get Inspired service.
 *
 * Generates 5-7 personalised post ideas using the user's voice profile +
 * historical posts + active Watched Topics. Persists ideas so save / dismiss
 * / workshop are stable across page loads.
 *
 * Idea source filter (`all` | `proven` | `adjacent` | `timely` | `stretch`)
 * shapes the prompt. Timely ideas are only generated when active Watched
 * Topics exist, and each timely idea must include a user-specific
 * timeliness_rationale or it gets dropped server-side.
 */

import { config } from "../../config.js";
import { pool } from "../../db/pool.js";
import { getLLMClient } from "../llm/anthropic.js";
import {
  buildInspirePrompt,
  buildPhase2System,
  loadPromptContext,
  type IdeaSource,
} from "../llm/phase2-prompts.js";
import { parseLooseJson } from "../llm/validators.js";
import { listActiveForUser as listActiveWatchedTopics } from "./watched-topics.js";

export type IdeaSourceType =
  | "performance_pattern"
  | "adjacent_theme"
  | "voice_gap"
  | "timely"
  | "manual_seed";

export type InspirationIdea = {
  idea_id: string;
  title: string;
  suggested_angle: string;
  why_this: string;
  source_type: IdeaSourceType;
  evidence_post_ids: string[];
  watched_topic_ids: string[];
  timeliness_rationale: string | null;
  workshop_seed_prompt: string;
  status: "active" | "saved" | "dismissed" | "used";
  created_at: string;
};

type RawIdea = {
  title?: string;
  suggested_angle?: string;
  why_this?: string;
  source_type?: string;
  evidence_post_ids?: string[];
  watched_topic_ids?: string[];
  timeliness_rationale?: string;
  workshop_seed_prompt?: string;
};

const ALLOWED_SOURCE_TYPES = new Set<IdeaSourceType>([
  "performance_pattern",
  "adjacent_theme",
  "voice_gap",
  "timely",
  "manual_seed",
]);

const SELECT_FIELDS = `idea_id, title, suggested_angle, why_this, source_type,
  evidence_post_ids, watched_topic_ids, timeliness_rationale,
  workshop_seed_prompt, status, created_at::text`;

export async function listIdeas(
  userId: string,
  filter?: IdeaSource,
): Promise<InspirationIdea[]> {
  const filterClause = filter && filter !== "all" ? buildSourceFilter(filter) : "";
  const { rows } = await pool.query<InspirationIdea>(
    `SELECT ${SELECT_FIELDS}
       FROM inspiration_ideas
      WHERE user_id = $1 AND status IN ('active', 'saved') ${filterClause}
      ORDER BY status DESC, created_at DESC
      LIMIT 30`,
    [userId],
  );
  return rows;
}

export async function refreshIdeas(
  userId: string,
  ideaSource: IdeaSource = "all",
): Promise<InspirationIdea[]> {
  const ctx = await loadPromptContext(userId);
  if (!ctx) throw new Error("Voice profile required before generating ideas");

  const watchedTopics = await listActiveWatchedTopics(userId);

  // If the user picked Timely but has no active watched topics, skip the LLM
  // call entirely. The page will show the "add topics to watch" empty state.
  if (ideaSource === "timely" && watchedTopics.length === 0) {
    return [];
  }

  // Mark stale active ideas so we don't pile them up forever.
  await pool.query(
    `UPDATE inspiration_ideas SET status = 'dismissed'
      WHERE user_id = $1 AND status = 'active' AND created_at < now() - interval '14 days'`,
    [userId],
  );

  const dismissed = (
    await pool.query<{ title: string }>(
      `SELECT title FROM inspiration_ideas WHERE user_id = $1 AND status = 'dismissed' ORDER BY created_at DESC LIMIT 12`,
      [userId],
    )
  ).rows.map((r) => r.title);

  const saved = (
    await pool.query<{ title: string }>(
      `SELECT title FROM inspiration_ideas WHERE user_id = $1 AND status = 'saved' ORDER BY created_at DESC LIMIT 12`,
      [userId],
    )
  ).rows.map((r) => r.title);

  const system = buildPhase2System(ctx);
  const userPrompt = buildInspirePrompt({
    count: 6,
    dismissed,
    saved,
    ideaSource,
    watchedTopics: watchedTopics.map((t) => ({ label: t.label, priority: t.priority })),
    topicAuthorities: ctx.profile.topic_authorities ?? [],
  });

  const llm = getLLMClient();
  const response = await llm.complete({
    model: config.anthropic.generationModel,
    system,
    messages: [{ role: "user", content: userPrompt }],
    max_tokens: 2200,
    temperature: 0.85,
  });

  const parsed = parseLooseJson<{ ideas?: RawIdea[] }>(response.text);
  const rawIdeas = parsed?.ideas ?? [];

  // Map watched-topic labels back to their IDs for storage. The LLM returns
  // labels (since labels are what we put in the prompt), but we want the
  // database to reference IDs.
  const labelToId = new Map<string, string>();
  for (const t of watchedTopics) {
    labelToId.set(t.label.toLowerCase(), t.watched_topic_id);
  }

  const inserted: InspirationIdea[] = [];
  for (const raw of rawIdeas) {
    if (!raw.title || !raw.suggested_angle || !raw.why_this) continue;

    const sourceType: IdeaSourceType = ALLOWED_SOURCE_TYPES.has(
      raw.source_type as IdeaSourceType,
    )
      ? (raw.source_type as IdeaSourceType)
      : "adjacent_theme";

    // Reject timely ideas without a user-specific rationale. Per spec.
    const timelinessRationale = (raw.timeliness_rationale ?? "").trim();
    if (sourceType === "timely" && timelinessRationale.length < 10) {
      console.warn(
        `[inspire] dropping timely idea "${raw.title}" — no timeliness_rationale provided`,
      );
      continue;
    }

    const watchedTopicIds = (raw.watched_topic_ids ?? [])
      .map((label) => labelToId.get(String(label).toLowerCase()))
      .filter((id): id is string => Boolean(id));

    const result = await pool.query<{
      idea_id: string;
      created_at: string;
    }>(
      `INSERT INTO inspiration_ideas (
         user_id, title, suggested_angle, why_this, source_type,
         evidence_post_ids, watched_topic_ids, timeliness_rationale,
         workshop_seed_prompt, status, expires_at
       ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9, 'active', now() + interval '14 days')
       RETURNING idea_id, created_at::text`,
      [
        userId,
        raw.title,
        raw.suggested_angle,
        raw.why_this,
        sourceType,
        JSON.stringify(raw.evidence_post_ids ?? []),
        JSON.stringify(watchedTopicIds),
        sourceType === "timely" ? timelinessRationale : null,
        raw.workshop_seed_prompt ?? raw.title,
      ],
    );
    inserted.push({
      idea_id: result.rows[0]!.idea_id,
      title: raw.title,
      suggested_angle: raw.suggested_angle,
      why_this: raw.why_this,
      source_type: sourceType,
      evidence_post_ids: raw.evidence_post_ids ?? [],
      watched_topic_ids: watchedTopicIds,
      timeliness_rationale: sourceType === "timely" ? timelinessRationale : null,
      workshop_seed_prompt: raw.workshop_seed_prompt ?? raw.title,
      status: "active",
      created_at: result.rows[0]!.created_at,
    });
  }
  return inserted;
}

export async function setIdeaStatus(
  userId: string,
  ideaId: string,
  status: InspirationIdea["status"],
): Promise<InspirationIdea | null> {
  const { rows } = await pool.query<InspirationIdea>(
    `UPDATE inspiration_ideas SET status = $3
      WHERE user_id = $1 AND idea_id = $2
      RETURNING ${SELECT_FIELDS}`,
    [userId, ideaId, status],
  );
  return rows[0] ?? null;
}

export async function getIdea(userId: string, ideaId: string): Promise<InspirationIdea | null> {
  const { rows } = await pool.query<InspirationIdea>(
    `SELECT ${SELECT_FIELDS}
       FROM inspiration_ideas
      WHERE user_id = $1 AND idea_id = $2`,
    [userId, ideaId],
  );
  return rows[0] ?? null;
}

function buildSourceFilter(source: Exclude<IdeaSource, "all">): string {
  switch (source) {
    case "proven":
      return `AND source_type = 'performance_pattern'`;
    case "adjacent":
      return `AND source_type = 'adjacent_theme'`;
    case "timely":
      return `AND source_type = 'timely'`;
    case "stretch":
      return `AND source_type = 'voice_gap'`;
    default:
      return "";
  }
}
