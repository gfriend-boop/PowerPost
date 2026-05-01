import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";
import { assignArchetype } from "../services/archetype.js";
import { HttpError, asyncHandler } from "../utils/http.js";

const router = Router();

const PostingCadence = z.enum(["light", "regular", "daily"]);
const LinkedInGoal = z.enum([
  "inbound_leads",
  "thought_leadership",
  "career_visibility",
  "speaking",
  "board_role",
  "network_growth",
]);

const CreateProfileSchema = z.object({
  role_identity: z.string().min(1).max(500),
  snippet_pick_hook: z.enum(["hook_a_direct", "hook_b_story", "hook_c_challenger"]),
  topic_authorities: z.array(z.string().min(1).max(80)).max(20).default([]),
  snippet_pick_opening: z.enum(["opening_a_data", "opening_b_personal"]),
  topic_exclusions: z.array(z.string().min(1).max(120)).max(10).default([]),
  vocabulary_favors: z.array(z.string().min(1).max(60)).max(3).default([]),
  vocabulary_avoids: z.array(z.string().min(1).max(60)).max(3).default([]),
  linkedin_goal: LinkedInGoal,
  target_audience: z.string().min(1).max(600),
  snippet_pick_cta: z.enum(["cta_a_direct", "cta_b_reflective"]),
  posting_cadence: PostingCadence,
  never_be_mistaken_for: z.string().min(1).max(300),
});

const PatchProfileSchema = z.object({
  tone_warmth: z.number().int().min(1).max(10).optional(),
  tone_storytelling: z.number().int().min(1).max(10).optional(),
  tone_provocation: z.number().int().min(1).max(10).optional(),
  signature_phrases: z.array(z.string().min(1).max(120)).max(3).optional(),
  topic_exclusions_extra: z.array(z.string().min(1).max(120)).optional(),
});

function completenessScore(input: z.infer<typeof CreateProfileSchema>): number {
  let score = 0;
  // Required snippet picks
  score += 10; // hook
  score += 10; // opening
  score += 10; // cta
  score += 10; // goal
  score += 10; // cadence
  score += 10; // role identity
  score += 10; // never be mistaken for
  score += 10; // target audience
  if (input.topic_authorities.length > 0) score += 10;
  if (input.topic_exclusions.length > 0) score += 5;
  if (input.vocabulary_favors.length > 0 || input.vocabulary_avoids.length > 0) score += 5;
  return Math.min(100, score);
}

router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT * FROM voice_profiles WHERE user_id = $1`,
      [req.user!.id],
    );
    if (rows.length === 0) {
      res.json({ profile: null });
      return;
    }
    res.json({ profile: rows[0] });
  }),
);

router.post(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = CreateProfileSchema.parse(req.body);
    const userId = req.user!.id;

    const assignment = assignArchetype({
      hookPick: body.snippet_pick_hook,
      openingPick: body.snippet_pick_opening,
      ctaPick: body.snippet_pick_cta,
      linkedInGoal: body.linkedin_goal,
      neverBeMistakenFor: body.never_be_mistaken_for,
      vocabularyAvoids: body.vocabulary_avoids,
      vocabularyFavors: body.vocabulary_favors,
    });

    const { rows: archetypeRows } = await pool.query<{
      default_warmth: number;
      default_storytelling: number;
      default_provocation: number;
    }>(
      `SELECT default_warmth, default_storytelling, default_provocation
         FROM archetypes WHERE archetype_key = $1`,
      [assignment.archetype],
    );
    const defaults = archetypeRows[0] ?? {
      default_warmth: 5,
      default_storytelling: 5,
      default_provocation: 5,
    };

    const completeness = completenessScore(body);

    const upsertResult = await pool.query(
      `INSERT INTO voice_profiles (
         user_id, archetype, archetype_alternative,
         tone_warmth, tone_storytelling, tone_provocation,
         topic_authorities, topic_exclusions,
         vocabulary_favors, vocabulary_avoids,
         linkedin_goal, target_audience, posting_cadence,
         signature_phrases,
         snippet_pick_hook, snippet_pick_opening, snippet_pick_cta,
         role_identity, never_be_mistaken_for,
         profile_completeness_score, questionnaire_completed,
         last_updated
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10::jsonb,
         $11,$12,$13,$14::jsonb,$15,$16,$17,$18,$19,$20,TRUE,now()
       )
       ON CONFLICT (user_id) DO UPDATE SET
         archetype = EXCLUDED.archetype,
         archetype_alternative = EXCLUDED.archetype_alternative,
         tone_warmth = EXCLUDED.tone_warmth,
         tone_storytelling = EXCLUDED.tone_storytelling,
         tone_provocation = EXCLUDED.tone_provocation,
         topic_authorities = EXCLUDED.topic_authorities,
         topic_exclusions = EXCLUDED.topic_exclusions,
         vocabulary_favors = EXCLUDED.vocabulary_favors,
         vocabulary_avoids = EXCLUDED.vocabulary_avoids,
         linkedin_goal = EXCLUDED.linkedin_goal,
         target_audience = EXCLUDED.target_audience,
         posting_cadence = EXCLUDED.posting_cadence,
         snippet_pick_hook = EXCLUDED.snippet_pick_hook,
         snippet_pick_opening = EXCLUDED.snippet_pick_opening,
         snippet_pick_cta = EXCLUDED.snippet_pick_cta,
         role_identity = EXCLUDED.role_identity,
         never_be_mistaken_for = EXCLUDED.never_be_mistaken_for,
         profile_completeness_score = EXCLUDED.profile_completeness_score,
         questionnaire_completed = TRUE,
         last_updated = now()
       RETURNING *`,
      [
        userId,
        assignment.archetype,
        assignment.alternative,
        defaults.default_warmth,
        defaults.default_storytelling,
        defaults.default_provocation,
        JSON.stringify(body.topic_authorities),
        JSON.stringify(body.topic_exclusions),
        JSON.stringify(body.vocabulary_favors),
        JSON.stringify(body.vocabulary_avoids),
        body.linkedin_goal,
        body.target_audience,
        body.posting_cadence,
        JSON.stringify([]),
        body.snippet_pick_hook,
        body.snippet_pick_opening,
        body.snippet_pick_cta,
        body.role_identity,
        body.never_be_mistaken_for,
        completeness,
      ],
    );

    const profile = upsertResult.rows[0];

    const archetypeMeta = await pool.query(
      `SELECT archetype_key, display_name, description, who_this_is, sample_post
         FROM archetypes WHERE archetype_key = ANY($1::text[])`,
      [[assignment.archetype, assignment.alternative].filter(Boolean)],
    );

    res.status(201).json({
      profile,
      archetype: archetypeMeta.rows.find((r) => r.archetype_key === assignment.archetype),
      alternative: assignment.alternative
        ? archetypeMeta.rows.find((r) => r.archetype_key === assignment.alternative)
        : null,
      scores: assignment.scores,
    });
  }),
);

router.patch(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = PatchProfileSchema.parse(req.body);
    const userId = req.user!.id;

    const sets: string[] = [];
    const values: unknown[] = [userId];
    const push = (clause: string, value: unknown) => {
      values.push(value);
      sets.push(`${clause} = $${values.length}`);
    };

    if (body.tone_warmth !== undefined) push("tone_warmth", body.tone_warmth);
    if (body.tone_storytelling !== undefined) push("tone_storytelling", body.tone_storytelling);
    if (body.tone_provocation !== undefined) push("tone_provocation", body.tone_provocation);
    if (body.signature_phrases !== undefined) {
      values.push(JSON.stringify(body.signature_phrases));
      sets.push(`signature_phrases = $${values.length}::jsonb`);
    }

    if (body.topic_exclusions_extra && body.topic_exclusions_extra.length > 0) {
      const existing = await pool.query<{ topic_exclusions: string[] }>(
        `SELECT topic_exclusions FROM voice_profiles WHERE user_id = $1`,
        [userId],
      );
      const current = existing.rows[0]?.topic_exclusions ?? [];
      const merged = Array.from(new Set([...current, ...body.topic_exclusions_extra])).slice(0, 10);
      values.push(JSON.stringify(merged));
      sets.push(`topic_exclusions = $${values.length}::jsonb`);
    }

    if (sets.length === 0) {
      throw new HttpError(400, "Nothing to update");
    }

    sets.push("last_updated = now()");

    const sql = `UPDATE voice_profiles SET ${sets.join(", ")} WHERE user_id = $1 RETURNING *`;
    const { rows } = await pool.query(sql, values);
    if (rows.length === 0) {
      throw new HttpError(404, "Voice profile not found");
    }
    res.json({ profile: rows[0] });
  }),
);

router.get(
  "/archetype-preview",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query<{ archetype: string }>(
      `SELECT archetype FROM voice_profiles WHERE user_id = $1`,
      [req.user!.id],
    );
    const key = rows[0]?.archetype;
    if (!key) {
      throw new HttpError(404, "No archetype assigned yet");
    }
    const meta = await pool.query(
      `SELECT archetype_key, display_name, description, who_this_is, sample_post
         FROM archetypes WHERE archetype_key = $1`,
      [key],
    );
    res.json({ archetype: meta.rows[0] });
  }),
);

router.get(
  "/onboarding-config",
  asyncHandler(async (_req, res) => {
    const [copy, snippets, topics, archetypes] = await Promise.all([
      pool.query("SELECT * FROM onboarding_copy ORDER BY step_index NULLS LAST, copy_key"),
      pool.query("SELECT * FROM snippets ORDER BY pick_group, sort_order"),
      pool.query("SELECT * FROM topics ORDER BY sort_order"),
      pool.query(
        "SELECT archetype_key, display_name, description FROM archetypes ORDER BY sort_order",
      ),
    ]);
    res.json({
      copy: copy.rows,
      snippets: snippets.rows,
      topics: topics.rows,
      archetypes: archetypes.rows,
    });
  }),
);

export default router;
