/**
 * Feedback events + learned preferences.
 *
 * Records all explicit and implicit feedback. After every event, decides
 * whether to re-run the learned-preferences extractor (debounced: only if
 * the user has accumulated >= EXTRACT_THRESHOLD new actionable events since
 * the last extraction OR if they explicitly added a note).
 */

import { config } from "../../config.js";
import { pool } from "../../db/pool.js";
import { getLLMClient } from "../llm/anthropic.js";
import {
  buildExtractPreferencesPrompt,
  buildPhase2System,
  loadPromptContext,
} from "../llm/phase2-prompts.js";
import { parseLooseJson } from "../llm/validators.js";

export const FEEDBACK_EVENT_TYPES = [
  "thumbs_up",
  "thumbs_down",
  "manual_edit",
  "suggestion_accepted",
  "suggestion_rejected",
  "suggestion_accept_all",
  "draft_copied",
  "draft_finalized",
  "score_requested",
  "optimization_requested",
  "learned_preference_confirmed",
  "learned_preference_rejected",
] as const;

export type FeedbackEventType = (typeof FEEDBACK_EVENT_TYPES)[number];

export const FEEDBACK_SURFACES = [
  "workshop",
  "improve_draft",
  "inspiration",
  "post_score",
  "voice_settings",
] as const;

export type FeedbackSurface = (typeof FEEDBACK_SURFACES)[number];

export type FeedbackEventInput = {
  userId: string;
  surface: FeedbackSurface;
  eventType: FeedbackEventType;
  sourceId?: string;
  contentId?: string;
  rawContentBefore?: string;
  rawContentAfter?: string;
  selectedKpi?: string;
  voiceScoreBefore?: number;
  voiceScoreAfter?: number;
  performanceScoreBefore?: number;
  performanceScoreAfter?: number;
  userNote?: string;
  metadata?: Record<string, unknown>;
};

export type FeedbackEvent = FeedbackEventInput & {
  feedback_event_id: string;
  created_at: string;
};

const TRIGGERS_EXTRACTION: ReadonlySet<FeedbackEventType> = new Set([
  "thumbs_down",
  "manual_edit",
  "suggestion_rejected",
  "suggestion_accepted",
  "draft_finalized",
  "optimization_requested",
]);

const EXTRACT_THRESHOLD = 3;

export async function recordEvent(input: FeedbackEventInput): Promise<FeedbackEvent> {
  const { rows } = await pool.query<{
    feedback_event_id: string;
    created_at: string;
  }>(
    `INSERT INTO feedback_events (
       user_id, source_surface, source_id, content_id, event_type,
       raw_content_before, raw_content_after, selected_kpi,
       voice_score_before, voice_score_after,
       performance_score_before, performance_score_after,
       user_note, metadata
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb)
     RETURNING feedback_event_id, created_at::text`,
    [
      input.userId,
      input.surface,
      input.sourceId ?? null,
      input.contentId ?? null,
      input.eventType,
      input.rawContentBefore ?? null,
      input.rawContentAfter ?? null,
      input.selectedKpi ?? null,
      input.voiceScoreBefore ?? null,
      input.voiceScoreAfter ?? null,
      input.performanceScoreBefore ?? null,
      input.performanceScoreAfter ?? null,
      input.userNote ?? null,
      JSON.stringify(input.metadata ?? {}),
    ],
  );

  const stored: FeedbackEvent = {
    ...input,
    feedback_event_id: rows[0]!.feedback_event_id,
    created_at: rows[0]!.created_at,
  };

  // Async fire-and-forget extractor when the event is signal-bearing. We do
  // it in-process (no worker) because Phase 2 doesn't have one yet, but we
  // wrap in setImmediate so the API response isn't blocked.
  if (input.userNote || TRIGGERS_EXTRACTION.has(input.eventType)) {
    setImmediate(() => {
      void maybeExtractPreferences(input.userId).catch((err) => {
        console.error("[learned-prefs] extraction failed:", err);
      });
    });
  }

  return stored;
}

async function maybeExtractPreferences(userId: string): Promise<void> {
  // How many actionable events since the last extraction?
  const { rows: stateRows } = await pool.query<{ last_extracted: string | null }>(
    `SELECT MAX(updated_at)::text AS last_extracted
       FROM learned_preferences WHERE user_id = $1`,
    [userId],
  );
  const lastExtracted = stateRows[0]?.last_extracted ?? null;

  const { rows: countRows } = await pool.query<{ count: string }>(
    `SELECT count(*)::text FROM feedback_events
      WHERE user_id = $1
        AND event_type = ANY($2::text[])
        AND ($3::timestamptz IS NULL OR created_at > $3::timestamptz)`,
    [userId, Array.from(TRIGGERS_EXTRACTION), lastExtracted],
  );
  const count = Number(countRows[0]?.count ?? "0");
  if (count < EXTRACT_THRESHOLD) return;

  await runPreferenceExtraction(userId);
}

export async function runPreferenceExtraction(userId: string): Promise<number> {
  const ctx = await loadPromptContext(userId);
  if (!ctx) return 0;

  // Pull the most recent actionable feedback events for the prompt.
  const { rows: events } = await pool.query<{
    feedback_event_id: string;
    event_type: string;
    raw_content_before: string | null;
    raw_content_after: string | null;
    user_note: string | null;
    created_at: string;
  }>(
    `SELECT feedback_event_id, event_type, raw_content_before, raw_content_after, user_note, created_at::text
       FROM feedback_events
      WHERE user_id = $1
        AND event_type = ANY($2::text[])
      ORDER BY created_at DESC LIMIT 30`,
    [userId, Array.from(TRIGGERS_EXTRACTION)],
  );
  if (events.length === 0) return 0;

  const { rows: existing } = await pool.query<{ preference_type: string }>(
    `SELECT preference_type FROM learned_preferences
      WHERE user_id = $1 AND status IN ('active', 'suggested')`,
    [userId],
  );

  const system = buildPhase2System(ctx);
  const userPrompt = buildExtractPreferencesPrompt({
    events,
    existingPreferenceTypes: existing.map((e) => e.preference_type),
  });

  const llm = getLLMClient();
  const response = await llm.complete({
    model: config.anthropic.generationModel,
    system,
    messages: [{ role: "user", content: userPrompt }],
    max_tokens: 1500,
    temperature: 0.2,
  });

  const parsed = parseLooseJson<{
    learned_preferences?: Array<{
      preference_type?: string;
      preference_summary?: string;
      prompt_instruction?: string;
      confidence?: number;
      evidence_event_ids?: string[];
      suggested_status?: "suggested" | "active";
    }>;
  }>(response.text);
  const candidates = parsed?.learned_preferences ?? [];

  let inserted = 0;
  for (const c of candidates) {
    if (!c.preference_type || !c.preference_summary || !c.prompt_instruction) continue;
    const confidence = Math.max(0, Math.min(1, Number(c.confidence ?? 0)));
    if (confidence < 0.4) continue; // ignore weak signals
    const status = pickStatus(confidence, c.suggested_status);
    await pool.query(
      `INSERT INTO learned_preferences (
         user_id, preference_type, preference_summary, prompt_instruction,
         confidence, evidence_count, evidence_event_ids, status
       ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
       ON CONFLICT (user_id, preference_type) WHERE status IN ('suggested', 'active') DO UPDATE SET
         preference_summary = EXCLUDED.preference_summary,
         prompt_instruction = EXCLUDED.prompt_instruction,
         confidence = GREATEST(learned_preferences.confidence, EXCLUDED.confidence),
         evidence_count = learned_preferences.evidence_count + EXCLUDED.evidence_count,
         evidence_event_ids = EXCLUDED.evidence_event_ids,
         updated_at = now()`,
      [
        userId,
        c.preference_type,
        c.preference_summary,
        c.prompt_instruction,
        confidence,
        c.evidence_event_ids?.length ?? 1,
        JSON.stringify(c.evidence_event_ids ?? []),
        status,
      ],
    );
    inserted++;
  }
  return inserted;
}

function pickStatus(
  confidence: number,
  suggested: "suggested" | "active" | undefined,
): "suggested" | "active" {
  // Match the Phase 2 spec: do not silently apply strong preferences without
  // user confirmation. We default to "suggested" unless confidence is very
  // high AND the model also nominated it as active.
  if (suggested === "active" && confidence >= 0.85) return "active";
  return "suggested";
}

export type LearnedPreferenceRow = {
  learned_preference_id: string;
  preference_type: string;
  preference_summary: string;
  prompt_instruction: string;
  confidence: number;
  evidence_count: number;
  status: "active" | "suggested" | "rejected" | "archived";
  created_at: string;
  updated_at: string;
};

export async function listLearnedPreferences(userId: string): Promise<LearnedPreferenceRow[]> {
  const { rows } = await pool.query<LearnedPreferenceRow>(
    `SELECT learned_preference_id, preference_type, preference_summary, prompt_instruction,
            confidence::float, evidence_count, status, created_at::text, updated_at::text
       FROM learned_preferences
      WHERE user_id = $1
      ORDER BY status ASC, confidence DESC, created_at DESC`,
    [userId],
  );
  return rows;
}

export async function updateLearnedPreference(
  userId: string,
  preferenceId: string,
  patch: Partial<{
    status: "suggested" | "active" | "rejected" | "archived";
    preference_summary: string;
    prompt_instruction: string;
  }>,
): Promise<LearnedPreferenceRow | null> {
  const sets: string[] = [];
  const values: unknown[] = [userId, preferenceId];
  if (patch.status) {
    values.push(patch.status);
    sets.push(`status = $${values.length}`);
  }
  if (patch.preference_summary) {
    values.push(patch.preference_summary);
    sets.push(`preference_summary = $${values.length}`);
  }
  if (patch.prompt_instruction) {
    values.push(patch.prompt_instruction);
    sets.push(`prompt_instruction = $${values.length}`);
  }
  if (sets.length === 0) return null;
  sets.push("updated_at = now()");
  const sql = `UPDATE learned_preferences SET ${sets.join(", ")}
                WHERE user_id = $1 AND learned_preference_id = $2
              RETURNING learned_preference_id, preference_type, preference_summary,
                        prompt_instruction, confidence::float, evidence_count,
                        status, created_at::text, updated_at::text`;
  const { rows } = await pool.query<LearnedPreferenceRow>(sql, values);
  return rows[0] ?? null;
}
