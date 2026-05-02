/**
 * Phase 2 API surface.
 *
 * Routes:
 *   POST   /content/score
 *   POST   /content/optimize
 *   POST   /content/improve
 *   GET    /content/improve/:id
 *   PATCH  /content/improve/:id/recommendation/:recId
 *   POST   /content/improve/:id/accept-all
 *   POST   /content/improve/:id/finalize
 *
 *   GET    /content/inspiration
 *   POST   /content/inspiration/refresh
 *   POST   /content/inspiration/:idea_id/workshop
 *   POST   /content/inspiration/:idea_id/save
 *   POST   /content/inspiration/:idea_id/dismiss
 *
 *   POST   /feedback/events
 *   GET    /feedback/preferences
 *   PATCH  /feedback/preferences/:id
 *
 *   GET    /analytics/alignment
 *   POST   /analytics/recalibration/start
 */

import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";
import {
  FEEDBACK_EVENT_TYPES,
  FEEDBACK_SURFACES,
  listLearnedPreferences,
  recordEvent,
  updateLearnedPreference,
} from "../services/phase2/feedback.js";
import {
  acceptAllRecommendations,
  finalizeImprovement,
  loadSession,
  optimizeDraft,
  setRecommendationStatus,
  startImprovement,
} from "../services/phase2/improve.js";
import {
  getIdea,
  listIdeas,
  refreshIdeas,
  setIdeaStatus,
} from "../services/phase2/inspire.js";
import { scoreDraft } from "../services/phase2/scoring.js";
import { computeAlignment } from "../services/phase2/alignment.js";
import { HttpError, asyncHandler } from "../utils/http.js";

const SelectedKpiEnum = z.enum([
  "impressions",
  "likes",
  "comments",
  "shares",
  "clicks",
  "inbound_leads",
  "profile_views",
]);

const router = Router();

/* ----- Scoring + Optimize ----- */

const ScoreSchema = z.object({
  draft_content: z.string().min(1).max(10000),
  selected_kpi: SelectedKpiEnum.optional(),
  content_id: z.string().uuid().optional(),
  bypass_cache: z.boolean().optional(),
});

router.post(
  "/content/score",
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = ScoreSchema.parse(req.body);
    const result = await scoreDraft({
      userId: req.user!.id,
      draft: body.draft_content,
      kpi: body.selected_kpi,
      contentId: body.content_id,
      bypassCache: body.bypass_cache,
    });
    res.json({ score: result });
  }),
);

const OptimizeSchema = z.object({
  draft_content: z.string().min(1).max(10000),
  target: z.enum(["voice", "performance", "balanced"]),
  selected_kpi: SelectedKpiEnum.optional(),
});

router.post(
  "/content/optimize",
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = OptimizeSchema.parse(req.body);
    const result = await optimizeDraft({
      userId: req.user!.id,
      draft: body.draft_content,
      target: body.target,
      kpi: body.selected_kpi,
    });
    res.json({ result });
  }),
);

/* ----- Improve My Draft ----- */

const ImproveStartSchema = z.object({
  draft_content: z.string().min(1).max(10000),
  selected_kpi: SelectedKpiEnum.optional(),
});

router.post(
  "/content/improve",
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = ImproveStartSchema.parse(req.body);
    const session = await startImprovement({
      userId: req.user!.id,
      draft: body.draft_content,
      kpi: body.selected_kpi,
    });
    res.status(201).json({ session });
  }),
);

router.get(
  "/content/improve/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const session = await loadSession(req.user!.id, req.params.id!);
    res.json({ session });
  }),
);

router.patch(
  "/content/improve/:id/recommendation/:recId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const status = z.enum(["accepted", "rejected"]).parse(req.body?.status);
    const session = await setRecommendationStatus({
      userId: req.user!.id,
      suggestionId: req.params.id!,
      recommendationId: req.params.recId!,
      status,
    });
    res.json({ session });
  }),
);

router.post(
  "/content/improve/:id/accept-all",
  requireAuth,
  asyncHandler(async (req, res) => {
    const pathType = z
      .enum(["voice", "performance", "balanced"])
      .optional()
      .parse(req.body?.path_type);
    const session = await acceptAllRecommendations({
      userId: req.user!.id,
      suggestionId: req.params.id!,
      pathType,
    });
    res.json({ session });
  }),
);

const FinalizeSchema = z.object({ draft: z.string().min(1).max(10000) });

router.post(
  "/content/improve/:id/finalize",
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = FinalizeSchema.parse(req.body);
    const session = await finalizeImprovement({
      userId: req.user!.id,
      suggestionId: req.params.id!,
      draft: body.draft,
    });
    res.json({ session });
  }),
);

/* ----- Get Inspired ----- */

router.get(
  "/content/inspiration",
  requireAuth,
  asyncHandler(async (req, res) => {
    let ideas = await listIdeas(req.user!.id);
    if (ideas.length === 0) {
      // First-time visit: auto-generate so the page is never empty.
      ideas = await refreshIdeas(req.user!.id);
    }
    res.json({ ideas });
  }),
);

router.post(
  "/content/inspiration/refresh",
  requireAuth,
  asyncHandler(async (req, res) => {
    const ideas = await refreshIdeas(req.user!.id);
    res.status(201).json({ ideas });
  }),
);

router.post(
  "/content/inspiration/:idea_id/save",
  requireAuth,
  asyncHandler(async (req, res) => {
    const idea = await setIdeaStatus(req.user!.id, req.params.idea_id!, "saved");
    if (!idea) throw new HttpError(404, "Idea not found");
    res.json({ idea });
  }),
);

router.post(
  "/content/inspiration/:idea_id/dismiss",
  requireAuth,
  asyncHandler(async (req, res) => {
    const idea = await setIdeaStatus(req.user!.id, req.params.idea_id!, "dismissed");
    if (!idea) throw new HttpError(404, "Idea not found");
    res.json({ idea });
  }),
);

router.post(
  "/content/inspiration/:idea_id/workshop",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const idea = await getIdea(userId, req.params.idea_id!);
    if (!idea) throw new HttpError(404, "Idea not found");

    const seed = `${idea.title}. ${idea.workshop_seed_prompt}`;
    const result = await pool.query<{ workshop_id: string }>(
      `INSERT INTO workshop_sessions (user_id, title, status)
       VALUES ($1, $2, 'active') RETURNING workshop_id`,
      [userId, idea.title.slice(0, 60)],
    );
    const workshopId = result.rows[0]!.workshop_id;
    await pool.query(
      `INSERT INTO workshop_messages (workshop_id, role, content)
       VALUES ($1, 'user', $2)`,
      [workshopId, seed],
    );
    await setIdeaStatus(userId, idea.idea_id, "used");

    res.status(201).json({ workshop_id: workshopId, idea });
  }),
);

/* ----- Feedback ----- */

const FeedbackEventSchema = z.object({
  surface: z.enum(FEEDBACK_SURFACES),
  event_type: z.enum(FEEDBACK_EVENT_TYPES),
  source_id: z.string().uuid().optional(),
  content_id: z.string().uuid().optional(),
  raw_content_before: z.string().max(20000).optional(),
  raw_content_after: z.string().max(20000).optional(),
  selected_kpi: SelectedKpiEnum.optional(),
  voice_score_before: z.number().min(1).max(10).optional(),
  voice_score_after: z.number().min(1).max(10).optional(),
  performance_score_before: z.number().min(1).max(10).optional(),
  performance_score_after: z.number().min(1).max(10).optional(),
  user_note: z.string().max(2000).optional(),
  metadata: z.record(z.unknown()).optional(),
});

router.post(
  "/feedback/events",
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = FeedbackEventSchema.parse(req.body);
    const event = await recordEvent({
      userId: req.user!.id,
      surface: body.surface,
      eventType: body.event_type,
      sourceId: body.source_id,
      contentId: body.content_id,
      rawContentBefore: body.raw_content_before,
      rawContentAfter: body.raw_content_after,
      selectedKpi: body.selected_kpi,
      voiceScoreBefore: body.voice_score_before,
      voiceScoreAfter: body.voice_score_after,
      performanceScoreBefore: body.performance_score_before,
      performanceScoreAfter: body.performance_score_after,
      userNote: body.user_note,
      metadata: body.metadata,
    });
    res.status(201).json({ event });
  }),
);

router.get(
  "/feedback/preferences",
  requireAuth,
  asyncHandler(async (req, res) => {
    const preferences = await listLearnedPreferences(req.user!.id);
    res.json({ preferences });
  }),
);

const PreferencePatchSchema = z.object({
  status: z.enum(["suggested", "active", "rejected", "archived"]).optional(),
  preference_summary: z.string().min(1).max(500).optional(),
  prompt_instruction: z.string().min(1).max(800).optional(),
});

router.patch(
  "/feedback/preferences/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = PreferencePatchSchema.parse(req.body);
    const pref = await updateLearnedPreference(req.user!.id, req.params.id!, body);
    if (!pref) throw new HttpError(404, "Learned preference not found");

    // Mirror the user's confirm/reject choice into a feedback event so the
    // extractor doesn't keep re-suggesting the same preference.
    if (body.status === "active") {
      await recordEvent({
        userId: req.user!.id,
        surface: "voice_settings",
        eventType: "learned_preference_confirmed",
        sourceId: pref.learned_preference_id,
        metadata: { preference_type: pref.preference_type },
      });
    } else if (body.status === "rejected") {
      await recordEvent({
        userId: req.user!.id,
        surface: "voice_settings",
        eventType: "learned_preference_rejected",
        sourceId: pref.learned_preference_id,
        metadata: { preference_type: pref.preference_type },
      });
    }
    res.json({ preference: pref });
  }),
);

/* ----- Analytics / Alignment ----- */

router.get(
  "/analytics/alignment",
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await computeAlignment(req.user!.id);
    res.json(result);
  }),
);

router.post(
  "/analytics/recalibration/start",
  requireAuth,
  asyncHandler(async (_req, res) => {
    // The recalibration workflow re-uses the existing onboarding flow with
    // ?retake=1. We acknowledge the request and let the client navigate.
    res.json({ ok: true, redirect: "/onboarding?retake=1" });
  }),
);

export default router;
