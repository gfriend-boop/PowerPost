/**
 * Get Inspired service.
 *
 * Generates 5-7 personalised post ideas using user voice profile + history,
 * persists them so save / dismiss / workshop are stable across page loads.
 */

import { config } from "../../config.js";
import { pool } from "../../db/pool.js";
import { getLLMClient } from "../llm/anthropic.js";
import {
  buildInspirePrompt,
  buildPhase2System,
  loadPromptContext,
} from "../llm/phase2-prompts.js";
import { parseLooseJson } from "../llm/validators.js";

export type InspirationIdea = {
  idea_id: string;
  title: string;
  suggested_angle: string;
  why_this: string;
  source_type: "performance_pattern" | "adjacent_theme" | "voice_gap" | "trend" | "manual_seed";
  evidence_post_ids: string[];
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
  workshop_seed_prompt?: string;
};

const ALLOWED_SOURCE_TYPES = new Set([
  "performance_pattern",
  "adjacent_theme",
  "voice_gap",
  "trend",
  "manual_seed",
]);

export async function listIdeas(userId: string): Promise<InspirationIdea[]> {
  const { rows } = await pool.query<InspirationIdea>(
    `SELECT idea_id, title, suggested_angle, why_this, source_type,
            evidence_post_ids, workshop_seed_prompt, status, created_at::text
       FROM inspiration_ideas
      WHERE user_id = $1 AND status IN ('active', 'saved')
      ORDER BY status DESC, created_at DESC
      LIMIT 30`,
    [userId],
  );
  return rows;
}

export async function refreshIdeas(userId: string): Promise<InspirationIdea[]> {
  const ctx = await loadPromptContext(userId);
  if (!ctx) throw new Error("Voice profile required before generating ideas");

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
  });

  const llm = getLLMClient();
  const response = await llm.complete({
    model: config.anthropic.generationModel,
    system,
    messages: [{ role: "user", content: userPrompt }],
    max_tokens: 2000,
    temperature: 0.85,
  });

  const parsed = parseLooseJson<{ ideas?: RawIdea[] }>(response.text);
  const rawIdeas = parsed?.ideas ?? [];

  const inserted: InspirationIdea[] = [];
  for (const raw of rawIdeas) {
    if (!raw.title || !raw.suggested_angle || !raw.why_this) continue;
    const sourceType = ALLOWED_SOURCE_TYPES.has(String(raw.source_type))
      ? (raw.source_type as InspirationIdea["source_type"])
      : "adjacent_theme";
    const result = await pool.query<{
      idea_id: string;
      created_at: string;
    }>(
      `INSERT INTO inspiration_ideas (
         user_id, title, suggested_angle, why_this, source_type,
         evidence_post_ids, workshop_seed_prompt, status, expires_at
       ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, 'active', now() + interval '14 days')
       RETURNING idea_id, created_at::text`,
      [
        userId,
        raw.title,
        raw.suggested_angle,
        raw.why_this,
        sourceType,
        JSON.stringify(raw.evidence_post_ids ?? []),
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
      RETURNING idea_id, title, suggested_angle, why_this, source_type,
                evidence_post_ids, workshop_seed_prompt, status, created_at::text`,
    [userId, ideaId, status],
  );
  return rows[0] ?? null;
}

export async function getIdea(userId: string, ideaId: string): Promise<InspirationIdea | null> {
  const { rows } = await pool.query<InspirationIdea>(
    `SELECT idea_id, title, suggested_angle, why_this, source_type,
            evidence_post_ids, workshop_seed_prompt, status, created_at::text
       FROM inspiration_ideas
      WHERE user_id = $1 AND idea_id = $2`,
    [userId, ideaId],
  );
  return rows[0] ?? null;
}
