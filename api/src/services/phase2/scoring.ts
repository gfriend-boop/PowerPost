/**
 * Voice + performance scoring service.
 *
 * Cached: results are stored in `post_scores` keyed by (user_id, draft_text_hash, kpi).
 * Re-running with the same draft + KPI returns the cached result without
 * another LLM call.
 */

import { config } from "../../config.js";
import { pool } from "../../db/pool.js";
import { getLLMClient } from "../llm/anthropic.js";
import {
  buildPhase2System,
  buildScorePrompt,
  loadPromptContext,
  type SelectedKpi,
} from "../llm/phase2-prompts.js";
import { parseLooseJson } from "../llm/validators.js";
import { hashDraft } from "./hashing.js";

export type ScoreResult = {
  post_score_id: string;
  voice_score: number;
  performance_score: number;
  voice_rationale: string;
  performance_rationale: string;
  tradeoff_summary: string | null;
  evidence_post_ids: string[];
  confidence: "low" | "medium" | "high";
  cached: boolean;
};

type RawScore = {
  voice_score?: number;
  performance_score?: number;
  voice_rationale?: string;
  performance_rationale?: string;
  tradeoff_summary?: string;
  evidence_post_ids?: string[];
  confidence?: "low" | "medium" | "high";
};

const SPARSE_HISTORY_THRESHOLD = 3;

export async function scoreDraft(args: {
  userId: string;
  draft: string;
  kpi?: SelectedKpi;
  contentId?: string;
  bypassCache?: boolean;
}): Promise<ScoreResult> {
  const draftHash = hashDraft(args.draft);

  if (!args.bypassCache) {
    const cached = await pool.query<{
      post_score_id: string;
      voice_score: string;
      performance_score: string;
      voice_rationale: string;
      performance_rationale: string;
      tradeoff_summary: string | null;
      evidence_post_ids: string[];
      confidence: "low" | "medium" | "high";
    }>(
      `SELECT post_score_id, voice_score::text, performance_score::text,
              voice_rationale, performance_rationale, tradeoff_summary,
              evidence_post_ids, confidence
         FROM post_scores
        WHERE user_id = $1 AND draft_text_hash = $2 AND COALESCE(selected_kpi, '') = COALESCE($3, '')
        ORDER BY created_at DESC LIMIT 1`,
      [args.userId, draftHash, args.kpi ?? null],
    );
    if (cached.rowCount && cached.rows[0]) {
      const row = cached.rows[0];
      return {
        post_score_id: row.post_score_id,
        voice_score: Number(row.voice_score),
        performance_score: Number(row.performance_score),
        voice_rationale: row.voice_rationale,
        performance_rationale: row.performance_rationale,
        tradeoff_summary: row.tradeoff_summary,
        evidence_post_ids: row.evidence_post_ids ?? [],
        confidence: row.confidence,
        cached: true,
      };
    }
  }

  const ctx = await loadPromptContext(args.userId, { kpi: args.kpi });
  if (!ctx) {
    throw new Error("Voice profile required before scoring");
  }

  const system = buildPhase2System(ctx, { kpi: args.kpi });
  const userPrompt = buildScorePrompt({ draft: args.draft, kpi: args.kpi });

  const llm = getLLMClient();
  const response = await llm.complete({
    model: config.anthropic.generationModel,
    system,
    messages: [{ role: "user", content: userPrompt }],
    max_tokens: 800,
    temperature: 0.2,
  });

  const parsed = parseLooseJson<RawScore>(response.text) ?? {};
  const voiceScore = clampScore(parsed.voice_score);
  const performanceScore = clampScore(parsed.performance_score);
  const fallbackConfidence: "low" | "medium" | "high" =
    ctx.topPosts.length + ctx.recentPosts.length < SPARSE_HISTORY_THRESHOLD ? "low" : "medium";
  const confidence = parsed.confidence ?? fallbackConfidence;

  const inserted = await pool.query<{ post_score_id: string }>(
    `INSERT INTO post_scores (
       user_id, content_id, draft_text_hash, selected_kpi,
       voice_score, performance_score,
       voice_rationale, performance_rationale, tradeoff_summary,
       evidence_post_ids, confidence
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11)
     RETURNING post_score_id`,
    [
      args.userId,
      args.contentId ?? null,
      draftHash,
      args.kpi ?? null,
      voiceScore,
      performanceScore,
      parsed.voice_rationale ?? "",
      parsed.performance_rationale ?? "",
      parsed.tradeoff_summary ?? null,
      JSON.stringify(parsed.evidence_post_ids ?? []),
      confidence,
    ],
  );

  return {
    post_score_id: inserted.rows[0]!.post_score_id,
    voice_score: voiceScore,
    performance_score: performanceScore,
    voice_rationale: parsed.voice_rationale ?? "",
    performance_rationale: parsed.performance_rationale ?? "",
    tradeoff_summary: parsed.tradeoff_summary ?? null,
    evidence_post_ids: parsed.evidence_post_ids ?? [],
    confidence,
    cached: false,
  };
}

function clampScore(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 5;
  return Math.max(1, Math.min(10, Math.round(n)));
}
