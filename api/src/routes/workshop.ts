import { Router } from "express";
import { z } from "zod";
import { config } from "../config.js";
import { pool } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";
import { getLLMClient } from "../services/llm/anthropic.js";
import {
  buildHistoryContext,
  buildSystemPrompt,
  loadVoiceContextPosts,
  loadVoiceProfileForPrompt,
} from "../services/llm/prompts.js";
import { remediate, validate } from "../services/llm/validators.js";
import { scoreDraft } from "../services/phase2/scoring.js";
import { HttpError, asyncHandler } from "../utils/http.js";

const router = Router();

const POST_GOAL_VALUES = [
  "just_sound_like_me",
  "start_a_conversation",
  "get_more_reach",
  "attract_leads",
  "build_authority",
  "share_a_personal_story",
  "challenge_a_belief",
  "teach_something",
] as const;

const StartSchema = z.object({
  seed: z.string().max(2000).optional(),
  post_goal: z.enum(POST_GOAL_VALUES).optional(),
});

const MessageSchema = z.object({
  workshop_id: z.string().uuid(),
  message: z.string().min(1).max(4000),
});

const SaveDraftSchema = z.object({
  workshop_id: z.string().uuid(),
  draft_content: z.string().min(1).max(8000),
});

type StoredMessage = {
  message_id: string;
  role: "user" | "assistant";
  content: string;
  metadata: Record<string, unknown>;
  created_at: Date;
};

const WORKSHOP_SYSTEM_INSTRUCTION = `You are running in WORKSHOP MODE. Your job is to collaboratively build a single LinkedIn post with the user across multiple turns. You are NOT a one-shot generator. You are a thinking partner.

In every turn, choose ONE of these stances based on where the user is:
1. CLARIFY: Ask one targeted question that materially improves the draft you will produce next. Examples: "Do you have a personal anecdote about this?" "Want me to pull in a relevant stat or keep it experience-led?" "Who specifically are you imagining reading this?". Only ask when the answer would change the draft meaningfully.
2. DRAFT: Produce a complete short-form LinkedIn post draft that follows the user's voice profile precisely. End with one specific question inviting feedback or asking what to refine.
3. REFINE: When the user gives feedback or edits, produce a revised draft that addresses their input directly. Acknowledge the change you made in one sentence above the draft.

Rules:
- Never produce more than ONE draft per turn.
- Never ask more than ONE clarifying question per turn.
- The draft, when present, should be a clean post body with no headings, bullet labels, or meta-commentary inside it.
- Format your reply as JSON with this shape exactly: {"stance": "clarify" | "draft" | "refine", "message": "...", "draft": "..." or null}. The "message" field is your conversational reply visible to the user. The "draft" field contains the standalone post body when stance is draft or refine, otherwise null.
- The "draft" field MUST follow the hard content rules (no em-dashes, no broetry).`;

router.post(
  "/start",
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = StartSchema.parse(req.body);
    const userId = req.user!.id;

    const profile = await loadVoiceProfileForPrompt(userId);
    if (!profile) {
      throw new HttpError(409, "Complete onboarding before starting a workshop");
    }

    const result = await pool.query<{ workshop_id: string }>(
      `INSERT INTO workshop_sessions (user_id, title, status, post_goal)
       VALUES ($1, $2, 'active', $3)
       RETURNING workshop_id`,
      [
        userId,
        body.seed ? truncate(body.seed, 60) : "Untitled workshop",
        body.post_goal ?? null,
      ],
    );
    const workshopId = result.rows[0]!.workshop_id;

    const opener = body.seed
      ? `I want to write a post about: ${body.seed}`
      : "I'm not sure what to post about yet. Help me figure it out.";

    await pool.query(
      `INSERT INTO workshop_messages (workshop_id, role, content) VALUES ($1, 'user', $2)`,
      [workshopId, opener],
    );

    const reply = await runWorkshopTurn(userId, workshopId);

    res.status(201).json({
      workshop_id: workshopId,
      reply,
    });
  }),
);

router.post(
  "/message",
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = MessageSchema.parse(req.body);
    const userId = req.user!.id;

    await assertWorkshopOwnership(body.workshop_id, userId);

    await pool.query(
      `INSERT INTO workshop_messages (workshop_id, role, content) VALUES ($1, 'user', $2)`,
      [body.workshop_id, body.message],
    );
    await pool.query(
      `UPDATE workshop_sessions SET last_message_at = now() WHERE workshop_id = $1`,
      [body.workshop_id],
    );

    const reply = await runWorkshopTurn(userId, body.workshop_id);
    res.json({ reply });
  }),
);

router.get(
  "/:workshopId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const workshopId = req.params.workshopId!;
    const userId = req.user!.id;
    await assertWorkshopOwnership(workshopId, userId);
    const session = await pool.query(
      "SELECT * FROM workshop_sessions WHERE workshop_id = $1",
      [workshopId],
    );
    const messages = await pool.query<StoredMessage>(
      "SELECT message_id, role, content, metadata, created_at FROM workshop_messages WHERE workshop_id = $1 ORDER BY created_at ASC",
      [workshopId],
    );
    res.json({ session: session.rows[0], messages: messages.rows });
  }),
);

router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT workshop_id, title, status, created_at, last_message_at
         FROM workshop_sessions
        WHERE user_id = $1
        ORDER BY last_message_at DESC
        LIMIT 50`,
      [req.user!.id],
    );
    res.json({ sessions: rows });
  }),
);

router.post(
  "/save-draft",
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = SaveDraftSchema.parse(req.body);
    const userId = req.user!.id;
    await assertWorkshopOwnership(body.workshop_id, userId);

    const remediated = remediate(body.draft_content);

    const { rows } = await pool.query<{ content_id: string }>(
      `INSERT INTO generated_content (
         user_id, workshop_id, content_type, draft_content, status, validation_flags
       ) VALUES ($1, $2, 'short_post', $3, 'approved', $4::jsonb)
       RETURNING content_id`,
      [userId, body.workshop_id, remediated.text, JSON.stringify(remediated.flags)],
    );
    res.status(201).json({
      content_id: rows[0]!.content_id,
      draft_content: remediated.text,
      validation_flags: remediated.flags,
    });
  }),
);

async function assertWorkshopOwnership(workshopId: string, userId: string): Promise<void> {
  const { rowCount } = await pool.query(
    "SELECT 1 FROM workshop_sessions WHERE workshop_id = $1 AND user_id = $2",
    [workshopId, userId],
  );
  if (!rowCount) throw new HttpError(404, "Workshop session not found");
}

type WorkshopReply = {
  message_id: string;
  stance: "clarify" | "draft" | "refine";
  message: string;
  draft: string | null;
  validation_flags: ReturnType<typeof validate>["flags"];
  history_used: boolean;
  score: {
    voice_score: number;
    performance_score: number;
    voice_rationale: string;
    performance_rationale: string;
    tradeoff_summary: string | null;
    confidence: "low" | "medium" | "high";
  } | null;
};

async function runWorkshopTurn(userId: string, workshopId: string): Promise<WorkshopReply> {
  const profile = await loadVoiceProfileForPrompt(userId);
  if (!profile) throw new HttpError(409, "No voice profile found");

  const { topPosts, recentPosts, hasHistory } = await loadVoiceContextPosts(userId);

  const sessionRow = await pool.query<{ post_goal: string | null }>(
    `SELECT post_goal FROM workshop_sessions WHERE workshop_id = $1`,
    [workshopId],
  );
  const postGoal = sessionRow.rows[0]?.post_goal ?? null;

  const baseSystem = buildSystemPrompt(profile);
  const historyContext = buildHistoryContext(topPosts, recentPosts);
  const goalContext = postGoalContext(postGoal);
  const fullSystem = `${baseSystem}\n\n${historyContext}\n\n${goalContext}${WORKSHOP_SYSTEM_INSTRUCTION}`;

  const history = await pool.query<StoredMessage>(
    `SELECT role, content FROM workshop_messages WHERE workshop_id = $1 ORDER BY created_at ASC`,
    [workshopId],
  );

  const llm = getLLMClient();
  const response = await llm.complete({
    model: config.anthropic.generationModel,
    system: fullSystem,
    messages: history.rows.map((m) => ({ role: m.role, content: m.content })),
    max_tokens: 1500,
    temperature: 0.85,
  });

  const parsed = parseWorkshopReply(response.text);

  let cleanedDraft: string | null = parsed.draft;
  let flags: ReturnType<typeof validate>["flags"] = [];
  if (cleanedDraft) {
    const remediated = remediate(cleanedDraft);
    cleanedDraft = remediated.text;
    flags = remediated.flags;
  }

  let score: WorkshopReply["score"] = null;
  if (cleanedDraft) {
    try {
      const scored = await scoreDraft({
        userId,
        draft: cleanedDraft,
      });
      score = {
        voice_score: scored.voice_score,
        performance_score: scored.performance_score,
        voice_rationale: scored.voice_rationale,
        performance_rationale: scored.performance_rationale,
        tradeoff_summary: scored.tradeoff_summary,
        confidence: scored.confidence,
      };
    } catch (err) {
      console.warn("[workshop] score failed:", err);
    }
  }

  const metadata = {
    stance: parsed.stance,
    history_used: hasHistory,
    validation_flags: flags,
    score,
  };
  const stored = await pool.query<{ message_id: string }>(
    `INSERT INTO workshop_messages (workshop_id, role, content, metadata)
     VALUES ($1, 'assistant', $2, $3::jsonb)
     RETURNING message_id`,
    [workshopId, JSON.stringify({ message: parsed.message, draft: cleanedDraft }), JSON.stringify(metadata)],
  );

  await pool.query(
    `UPDATE workshop_sessions SET last_message_at = now() WHERE workshop_id = $1`,
    [workshopId],
  );

  return {
    message_id: stored.rows[0]!.message_id,
    stance: parsed.stance,
    message: parsed.message,
    draft: cleanedDraft,
    validation_flags: flags,
    history_used: hasHistory,
    score,
  };
}

function postGoalContext(goal: string | null): string {
  if (!goal) return "";
  const goalLine = (() => {
    switch (goal) {
      case "just_sound_like_me":
        return "USER POST GOAL: Just sound like me. The user has explicitly chosen voice fidelity over performance. Do NOT optimize for engagement. Do NOT add growth-y framing, hooks, or CTAs unless they would have been there in the user's natural voice. Prioritise sounding like a continuation of their best prior posts. If you would normally make a performance suggestion, hold it.";
      case "start_a_conversation":
        return "USER POST GOAL: Start a conversation. The user wants meaningful comments, not vanity engagement. Lean toward reflective endings, real questions tied to reader identity, and openings that put the reader inside a moment. Avoid generic 'what do you think?' closers.";
      case "get_more_reach":
        return "USER POST GOAL: Get more reach. The user wants this post to travel. Lean toward strong openings, clear universal hooks, and ideas the user's network would re-share. Do not sacrifice voice for clickbait.";
      case "attract_leads":
        return "USER POST GOAL: Attract inbound leads. Lean toward demonstrating expertise without selling. The post should make a target reader think 'I want this person on my team / advising me'. No direct CTAs unless that fits the user's voice.";
      case "build_authority":
        return "USER POST GOAL: Build authority. Lean toward perspective, frameworks, and a genuinely sharp take. Authority comes from saying something most people in the user's lane wouldn't, not from listing credentials.";
      case "share_a_personal_story":
        return "USER POST GOAL: Share a personal story. The post should center on a specific moment from the user's experience, not a general thesis. Specificity over universality. Avoid the lesson-up-front structure.";
      case "challenge_a_belief":
        return "USER POST GOAL: Challenge a common belief. The post should name a widely accepted idea and argue against it with substance. The user has earned the right to disagree. Do not soften the challenge for likeability.";
      case "teach_something":
        return "USER POST GOAL: Teach something useful. The post should leave the reader with something they can apply this week. Concrete over abstract. The lesson should be the spine of the post.";
      default:
        return "";
    }
  })();
  return goalLine ? `${goalLine}\n\n` : "";
}

function parseWorkshopReply(raw: string): {
  stance: "clarify" | "draft" | "refine";
  message: string;
  draft: string | null;
} {
  const trimmed = raw.trim();
  // The model is asked to reply in JSON; we try strict parse first, then a
  // tolerant extraction, then fall back to treating the whole reply as a draft.
  try {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      const parsed = JSON.parse(trimmed.slice(start, end + 1)) as {
        stance?: string;
        message?: string;
        draft?: string | null;
      };
      const stance =
        parsed.stance === "clarify" || parsed.stance === "refine" ? parsed.stance : "draft";
      return {
        stance,
        message: typeof parsed.message === "string" ? parsed.message : "",
        draft: typeof parsed.draft === "string" ? parsed.draft : null,
      };
    }
  } catch {
    // fall through
  }
  return {
    stance: "draft",
    message: "Here's a first draft. Tell me what to change.",
    draft: trimmed,
  };
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n).trimEnd() + "..." : s;
}

export default router;
