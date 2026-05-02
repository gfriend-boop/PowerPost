/**
 * Improve My Draft service.
 *
 * Returns voice-aligned and performance-aligned recommendation paths for a
 * pasted draft. Persists each session as an `improvement_suggestions` row
 * so individual recommendations can be accepted/rejected later.
 */

import { config } from "../../config.js";
import { pool } from "../../db/pool.js";
import { getLLMClient } from "../llm/anthropic.js";
import {
  buildImprovePrompt,
  buildOptimizePrompt,
  buildPhase2System,
  loadPromptContext,
  type SelectedKpi,
} from "../llm/phase2-prompts.js";
import { parseLooseJson, remediate, validate } from "../llm/validators.js";
import { scoreDraft } from "./scoring.js";

export type Recommendation = {
  recommendation_id: string;
  title: string;
  what_to_change: string;
  why_it_matters: string;
  suggested_replacement_text: string;
  voice_impact: "positive" | "neutral" | "negative";
  performance_impact: "positive" | "neutral" | "negative";
  evidence_post_id: string | null;
  status: "pending" | "accepted" | "rejected";
};

export type RecommendationPath = {
  path_type: "voice" | "performance" | "balanced";
  summary: string;
  recommendations: Recommendation[];
};

type RawImproveResponse = {
  paths?: Array<{
    path_type?: string;
    summary?: string;
    recommendations?: Array<{
      title?: string;
      what_to_change?: string;
      why_it_matters?: string;
      suggested_replacement_text?: string;
      voice_impact?: string;
      performance_impact?: string;
      evidence_post_id?: string | null;
    }>;
  }>;
  tradeoff_summary?: string;
};

export type ImprovementSession = {
  suggestion_id: string;
  user_id: string;
  original_draft: string;
  selected_kpi: string | null;
  voice_score_before: number;
  performance_score_before: number;
  paths: RecommendationPath[];
  tradeoff_summary: string;
  working_draft: string;
  final_draft: string | null;
  status: "open" | "finalized" | "discarded";
};

export async function startImprovement(args: {
  userId: string;
  draft: string;
  kpi?: SelectedKpi;
  target?: "voice" | "performance" | "balanced" | "just_voice";
  sourceWorkshopId?: string;
  sourceContentId?: string;
}): Promise<ImprovementSession> {
  const ctx = await loadPromptContext(args.userId, { kpi: args.kpi });
  if (!ctx) throw new Error("Voice profile required before improving a draft");

  const score = await scoreDraft({
    userId: args.userId,
    draft: args.draft,
    kpi: args.kpi,
  });

  const system = buildPhase2System(ctx, { kpi: args.kpi });
  const userPrompt =
    buildImprovePrompt({
      draft: args.draft,
      kpi: args.kpi,
      voiceScore: score.voice_score,
      performanceScore: score.performance_score,
    }) + targetHint(args.target);

  const llm = getLLMClient();
  const response = await llm.complete({
    model: config.anthropic.generationModel,
    system,
    messages: [{ role: "user", content: userPrompt }],
    max_tokens: 2400,
    temperature: 0.45,
  });

  const parsed = parseLooseJson<RawImproveResponse>(response.text);

  const paths: RecommendationPath[] = (parsed?.paths ?? []).map((p, i) => ({
    path_type: normalisePathType(p.path_type),
    summary: p.summary ?? "",
    recommendations: (p.recommendations ?? []).map((r, j) => ({
      recommendation_id: `r-${i}-${j}`,
      title: r.title ?? "Recommendation",
      what_to_change: r.what_to_change ?? "",
      why_it_matters: r.why_it_matters ?? "",
      suggested_replacement_text: stripDashesFromText(r.suggested_replacement_text ?? ""),
      voice_impact: normaliseImpact(r.voice_impact),
      performance_impact: normaliseImpact(r.performance_impact),
      evidence_post_id: r.evidence_post_id ?? null,
      status: "pending",
    })),
  }));

  const inserted = await pool.query<{ suggestion_id: string }>(
    `INSERT INTO improvement_suggestions (
       user_id, original_draft, selected_kpi,
       voice_score_before, performance_score_before,
       recommendations, working_draft, tradeoff_summary, status,
       source_workshop_id, optimization_target, content_id
     ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, 'open', $9, $10, $11)
     RETURNING suggestion_id`,
    [
      args.userId,
      args.draft,
      args.kpi ?? null,
      score.voice_score,
      score.performance_score,
      JSON.stringify(paths),
      args.draft,
      parsed?.tradeoff_summary ?? "",
      args.sourceWorkshopId ?? null,
      args.target ?? null,
      args.sourceContentId ?? null,
    ],
  );

  return {
    suggestion_id: inserted.rows[0]!.suggestion_id,
    user_id: args.userId,
    original_draft: args.draft,
    selected_kpi: args.kpi ?? null,
    voice_score_before: score.voice_score,
    performance_score_before: score.performance_score,
    paths,
    tradeoff_summary: parsed?.tradeoff_summary ?? "",
    working_draft: args.draft,
    final_draft: null,
    status: "open",
  };
}

export async function setRecommendationStatus(args: {
  userId: string;
  suggestionId: string;
  recommendationId: string;
  status: "accepted" | "rejected";
}): Promise<ImprovementSession> {
  const session = await loadSession(args.userId, args.suggestionId);
  let workingDraft = session.working_draft;
  for (const path of session.paths) {
    for (const rec of path.recommendations) {
      if (rec.recommendation_id === args.recommendationId) {
        rec.status = args.status;
        if (args.status === "accepted") {
          workingDraft = applyRecommendation(workingDraft, rec);
        }
      }
    }
  }
  await pool.query(
    `UPDATE improvement_suggestions
        SET recommendations = $3::jsonb, working_draft = $4, updated_at = now()
      WHERE suggestion_id = $1 AND user_id = $2`,
    [args.suggestionId, args.userId, JSON.stringify(session.paths), workingDraft],
  );
  return { ...session, working_draft: workingDraft };
}

export async function acceptAllRecommendations(args: {
  userId: string;
  suggestionId: string;
  pathType?: "voice" | "performance" | "balanced";
}): Promise<ImprovementSession> {
  const session = await loadSession(args.userId, args.suggestionId);
  let workingDraft = session.working_draft;
  for (const path of session.paths) {
    if (args.pathType && path.path_type !== args.pathType) continue;
    for (const rec of path.recommendations) {
      if (rec.status === "pending") {
        rec.status = "accepted";
        workingDraft = applyRecommendation(workingDraft, rec);
      }
    }
  }
  await pool.query(
    `UPDATE improvement_suggestions
        SET recommendations = $3::jsonb, working_draft = $4, updated_at = now()
      WHERE suggestion_id = $1 AND user_id = $2`,
    [args.suggestionId, args.userId, JSON.stringify(session.paths), workingDraft],
  );
  return { ...session, working_draft: workingDraft };
}

export async function finalizeImprovement(args: {
  userId: string;
  suggestionId: string;
  draft: string;
}): Promise<ImprovementSession> {
  const remediated = remediate(args.draft);
  const final = remediated.text;
  await pool.query(
    `UPDATE improvement_suggestions
        SET final_draft = $3, working_draft = $3, status = 'finalized', updated_at = now()
      WHERE suggestion_id = $1 AND user_id = $2`,
    [args.suggestionId, args.userId, final],
  );
  return { ...(await loadSession(args.userId, args.suggestionId)), final_draft: final };
}

export async function loadSession(
  userId: string,
  suggestionId: string,
): Promise<ImprovementSession> {
  const { rows } = await pool.query<{
    suggestion_id: string;
    user_id: string;
    original_draft: string;
    selected_kpi: string | null;
    voice_score_before: string | null;
    performance_score_before: string | null;
    recommendations: RecommendationPath[];
    working_draft: string | null;
    final_draft: string | null;
    tradeoff_summary: string | null;
    status: "open" | "finalized" | "discarded";
  }>(
    `SELECT suggestion_id, user_id, original_draft, selected_kpi,
            voice_score_before::text, performance_score_before::text,
            recommendations, working_draft, final_draft, tradeoff_summary, status
       FROM improvement_suggestions
      WHERE suggestion_id = $1 AND user_id = $2`,
    [suggestionId, userId],
  );
  const row = rows[0];
  if (!row) throw new Error("Improvement suggestion not found");
  return {
    suggestion_id: row.suggestion_id,
    user_id: row.user_id,
    original_draft: row.original_draft,
    selected_kpi: row.selected_kpi,
    voice_score_before: Number(row.voice_score_before ?? 0),
    performance_score_before: Number(row.performance_score_before ?? 0),
    paths: row.recommendations,
    working_draft: row.working_draft ?? row.original_draft,
    final_draft: row.final_draft,
    tradeoff_summary: row.tradeoff_summary ?? "",
    status: row.status,
  };
}

export async function optimizeDraft(args: {
  userId: string;
  draft: string;
  target: "voice" | "performance" | "balanced";
  kpi?: SelectedKpi;
}): Promise<{
  optimized_draft: string;
  what_changed: string;
  voice_score_estimate: number;
  performance_score_estimate: number;
  tradeoff_summary: string;
}> {
  const ctx = await loadPromptContext(args.userId, { kpi: args.kpi });
  if (!ctx) throw new Error("Voice profile required before optimizing");

  const system = buildPhase2System(ctx, { kpi: args.kpi });
  const userPrompt = buildOptimizePrompt({
    draft: args.draft,
    target: args.target,
    kpi: args.kpi,
  });

  const llm = getLLMClient();
  const response = await llm.complete({
    model: config.anthropic.generationModel,
    system,
    messages: [{ role: "user", content: userPrompt }],
    max_tokens: 2000,
    temperature: 0.55,
  });

  const parsed = parseLooseJson<{
    optimized_draft?: string;
    what_changed?: string;
    voice_score_estimate?: number;
    performance_score_estimate?: number;
    tradeoff_summary?: string;
  }>(response.text);

  const rawDraft = parsed?.optimized_draft ?? response.text;
  const remediated = remediate(rawDraft);
  const validation = validate(remediated.text);

  return {
    optimized_draft: remediated.text,
    what_changed: parsed?.what_changed ?? "",
    voice_score_estimate: clampScore(parsed?.voice_score_estimate),
    performance_score_estimate: clampScore(parsed?.performance_score_estimate),
    tradeoff_summary:
      parsed?.tradeoff_summary && parsed.tradeoff_summary.length > 0
        ? parsed.tradeoff_summary
        : validation.flags.length > 0
          ? "Some draft formatting was auto-cleaned during optimisation."
          : "",
  };
}

function targetHint(target: string | undefined): string {
  if (!target) return "";
  if (target === "voice" || target === "just_voice") {
    return `\n\nUSER OPTIMIZATION PREFERENCE: ${target === "just_voice" ? "Just sound like me" : "Voice alignment"}. The user explicitly does not want this draft over-optimized for engagement. Lean every recommendation toward fidelity to their natural voice. If a recommendation would only matter for performance, drop it.`;
  }
  if (target === "performance") {
    return "\n\nUSER OPTIMIZATION PREFERENCE: Performance. The user is willing to push the draft harder for the selected KPI. Still preserve their voice. Still call out tradeoffs. Do not suggest clickbait.";
  }
  return "\n\nUSER OPTIMIZATION PREFERENCE: Balanced. Improve both voice and performance without letting either dominate.";
}

function applyRecommendation(draft: string, rec: Recommendation): string {
  if (!rec.suggested_replacement_text.trim()) return draft;
  // If we can find a chunk to replace (the recommendation references the
  // user's existing text via what_to_change), do so. Otherwise append the
  // replacement. The conservative strategy keeps the LLM in charge of the
  // shape; the apply step only inserts what was suggested.
  if (rec.what_to_change && draft.includes(rec.what_to_change)) {
    return draft.replace(rec.what_to_change, rec.suggested_replacement_text);
  }
  return `${draft.trimEnd()}\n\n${rec.suggested_replacement_text.trim()}`;
}

function normalisePathType(value: unknown): "voice" | "performance" | "balanced" {
  if (value === "voice" || value === "performance") return value;
  return "balanced";
}

function normaliseImpact(value: unknown): "positive" | "neutral" | "negative" {
  if (value === "positive" || value === "negative") return value;
  return "neutral";
}

function stripDashesFromText(text: string): string {
  return text.replace(/[—\u2014\u2013]/g, ".").replace(/\.\s*\./g, ".").replace(/\s{2,}/g, " ");
}

function clampScore(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 5;
  return Math.max(1, Math.min(10, Math.round(n)));
}
