/**
 * Phase 2 prompt builders.
 *
 * Centralised so every scoring / improvement / inspiration / optimisation /
 * learned-prefs call shares the same global guardrails, voice profile
 * injection, learned-preference injection, and evidence-post handling.
 *
 * Source of truth: PowerPost Phase 2 — Prompt System Spec.
 */

import { pool } from "../../db/pool.js";
import {
  buildHistoryContext,
  loadVoiceContextPosts,
  loadVoiceProfileForPrompt,
  type VoiceProfileForPrompt,
} from "./prompts.js";

export type SelectedKpi =
  | "impressions"
  | "likes"
  | "comments"
  | "shares"
  | "clicks"
  | "inbound_leads"
  | "profile_views";

export type LearnedPreferenceRow = {
  learned_preference_id: string;
  preference_type: string;
  preference_summary: string;
  prompt_instruction: string;
  status: "active" | "suggested" | "rejected" | "archived";
  confidence: number;
};

export type EvidencePost = {
  post_id: string;
  content: string;
  posted_at: Date;
  likes: number;
  comments: number;
  shares: number;
  impressions: number;
  clicks: number;
  engagement: number;
};

const SHARED_SYSTEM = `You are PowerPost, a voice-first LinkedIn thought partner built by PowerSpeak Academy.

Your job is to help the user sound more like themselves while making intentional choices about performance. You are not a generic LinkedIn growth tool. You do not write influencer sludge. You do not chase engagement at the cost of trust.

GLOBAL RULES (every output must follow these):
- Do not use em dashes or en dashes. Use periods, commas, or rewrite the sentence.
- Do not use single-line broetry formatting. Every paragraph must contain at least two complete connected sentences.
- Do not use generic phrases like "boost engagement", "hook your audience", "drive value", "level up", "game changer", "unlock your potential", or "thought leadership content" used generically. If you must reference these ideas, name the specific mechanism instead.
- Do not recommend clickbait, false urgency, rage-bait, or artificial controversy.
- Do not optimise performance at the expense of user trust.
- Use clear, direct, coach-like language. Specific over abstract.
- Preserve the user's archetype, tone modifiers, vocabulary preferences, and guardrails.
- When evidence from the user's actual prior posts is available, reference it specifically.
- If evidence is sparse, say so and mark the recommendation as provisional.
- If voice fidelity and performance optimisation pull in different directions, name the tradeoff directly.
- Format any draft text with natural LinkedIn-ready paragraph breaks (blank lines between distinct ideas, 2 to 4 sentences per paragraph).

You will be given the user's voice profile, their learned preferences (patterns extracted from prior feedback), and a curated set of their recent and top-performing posts. Use them.`;

export async function loadLearnedPreferences(
  userId: string,
): Promise<LearnedPreferenceRow[]> {
  const { rows } = await pool.query<LearnedPreferenceRow>(
    `SELECT learned_preference_id, preference_type, preference_summary,
            prompt_instruction, status, confidence::float
       FROM learned_preferences
      WHERE user_id = $1 AND status IN ('active', 'suggested')
      ORDER BY status DESC, confidence DESC
      LIMIT 12`,
    [userId],
  );
  return rows;
}

export async function loadEvidencePosts(
  userId: string,
  options: { kpi?: SelectedKpi; limit?: number } = {},
): Promise<EvidencePost[]> {
  const limit = options.limit ?? 5;
  const orderColumn = kpiOrderColumn(options.kpi);
  const { rows } = await pool.query<EvidencePost>(
    `SELECT post_id, content, posted_at,
            likes, comments, shares, impressions, clicks,
            (likes + comments + shares)::int AS engagement
       FROM posts
      WHERE user_id = $1
      ORDER BY ${orderColumn} DESC, posted_at DESC
      LIMIT $2`,
    [userId, limit],
  );
  return rows;
}

function kpiOrderColumn(kpi: SelectedKpi | undefined): string {
  switch (kpi) {
    case "impressions":
      return "impressions";
    case "likes":
      return "likes";
    case "comments":
      return "comments";
    case "shares":
      return "shares";
    case "clicks":
      return "clicks";
    case "inbound_leads":
    case "profile_views":
    default:
      // No direct metric. Use overall engagement as a proxy.
      return "(likes + comments + shares)";
  }
}

function preferenceBlock(prefs: LearnedPreferenceRow[]): string {
  if (prefs.length === 0) return "LEARNED PREFERENCES: none yet. Use the voice profile as the primary signal.";
  const active = prefs.filter((p) => p.status === "active");
  const suggested = prefs.filter((p) => p.status === "suggested");
  const lines: string[] = [];
  if (active.length > 0) {
    lines.push("ACTIVE LEARNED PREFERENCES (apply by default):");
    for (const p of active) {
      lines.push(`  - [${p.preference_type}] ${p.preference_summary}`);
      lines.push(`    Instruction: ${p.prompt_instruction}`);
    }
  }
  if (suggested.length > 0) {
    lines.push("SUGGESTED LEARNED PREFERENCES (lean toward these but do not override the voice profile):");
    for (const p of suggested) {
      lines.push(`  - [${p.preference_type}] ${p.preference_summary} (confidence ${p.confidence.toFixed(2)})`);
      lines.push(`    Instruction: ${p.prompt_instruction}`);
    }
  }
  return lines.join("\n");
}

function evidenceBlock(posts: EvidencePost[], label: string, kpi?: SelectedKpi): string {
  if (posts.length === 0) {
    return `${label}: none available. Mark related recommendations as provisional and say so in the rationale.`;
  }
  const header = kpi
    ? `${label} (sorted by ${kpi}):`
    : `${label} (sorted by engagement):`;
  const items = posts.map((p, i) => {
    const truncated = p.content.length > 500 ? p.content.slice(0, 500).trimEnd() + "..." : p.content;
    const metricLine =
      kpi === "comments"
        ? `${p.comments} comments`
        : kpi === "shares"
          ? `${p.shares} shares`
          : kpi === "impressions"
            ? `${p.impressions} impressions`
            : kpi === "clicks"
              ? `${p.clicks} clicks`
              : kpi === "likes"
                ? `${p.likes} likes`
                : `${p.engagement} engagement`;
    return `[ID ${p.post_id} | ${metricLine}]\n${truncated}`;
  });
  return `${header}\n\n${items.join("\n\n")}`;
}

function profileBlock(profile: VoiceProfileForPrompt): string {
  const sliders = `Tone: warmth ${profile.tone_warmth}/10 (1=authority, 10=warmth) · storytelling ${profile.tone_storytelling}/10 (1=insight, 10=story) · provocation ${profile.tone_provocation}/10 (1=safe, 10=provocative).`;

  const exclusions =
    profile.topic_exclusions.length > 0
      ? `Off limits: ${profile.topic_exclusions.join(" | ")}.`
      : "";
  const vocab = [
    profile.vocabulary_favors.length > 0 ? `Favors: ${profile.vocabulary_favors.join(", ")}.` : "",
    profile.vocabulary_avoids.length > 0 ? `Avoids: ${profile.vocabulary_avoids.join(", ")}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
  const sigPhrases =
    profile.signature_phrases.length > 0
      ? `Signature phrases (use sparingly): ${profile.signature_phrases.join(" | ")}.`
      : "";

  return `USER VOICE PROFILE
Archetype: ${profile.archetype_display}
Archetype description: ${profile.archetype_who_this_is}
Reference sample post (style anchor only, do not copy lines):
"""
${profile.archetype_sample_post}
"""
${sliders}
LinkedIn goal: ${profile.linkedin_goal || "not specified"}.
Target audience: ${profile.target_audience || "not specified"}.
Role/identity: ${profile.role_identity || "not specified"}.
Never be mistaken for: ${profile.never_be_mistaken_for || "not specified"}.
Posting cadence: ${profile.posting_cadence}.
${vocab}
${exclusions}
${sigPhrases}`.trim();
}

export type PromptContext = {
  profile: VoiceProfileForPrompt;
  preferences: LearnedPreferenceRow[];
  topPosts: EvidencePost[];
  recentPosts: EvidencePost[];
  hasHistory: boolean;
};

export async function loadPromptContext(
  userId: string,
  options: { kpi?: SelectedKpi } = {},
): Promise<PromptContext | null> {
  const profile = await loadVoiceProfileForPrompt(userId);
  if (!profile) return null;
  const [preferences, topPosts, recentPosts] = await Promise.all([
    loadLearnedPreferences(userId),
    loadEvidencePosts(userId, { kpi: options.kpi, limit: 5 }),
    loadRecent(userId, 3),
  ]);
  return {
    profile,
    preferences,
    topPosts,
    recentPosts,
    hasHistory: topPosts.length + recentPosts.length > 0,
  };
}

async function loadRecent(userId: string, limit: number): Promise<EvidencePost[]> {
  const { rows } = await pool.query<EvidencePost>(
    `SELECT post_id, content, posted_at, likes, comments, shares, impressions, clicks,
            (likes + comments + shares)::int AS engagement
       FROM posts
      WHERE user_id = $1
      ORDER BY posted_at DESC
      LIMIT $2`,
    [userId, limit],
  );
  return rows;
}

export function buildPhase2System(ctx: PromptContext, options: { kpi?: SelectedKpi } = {}): string {
  const blocks = [
    SHARED_SYSTEM,
    profileBlock(ctx.profile),
    preferenceBlock(ctx.preferences),
    evidenceBlock(ctx.topPosts, "TOP POSTS", options.kpi),
    evidenceBlock(ctx.recentPosts, "RECENT POSTS"),
  ];
  if (!ctx.hasHistory) {
    blocks.push(
      "DATA NOTE: This user has no synced post history yet. Lean entirely on the voice profile and learned preferences. Mark any KPI-related claims as provisional.",
    );
  }
  return blocks.filter(Boolean).join("\n\n");
}

/* -----------------------------------------------------------------
 * Task-specific user-prompt builders. Each returns the user-message
 * content to be paired with the buildPhase2System system prompt.
 * Each requests strict JSON output.
 * --------------------------------------------------------------- */

export function buildScorePrompt(args: {
  draft: string;
  kpi?: SelectedKpi;
}): string {
  return `Score the draft below on two separate 1 to 10 scales.

1. Voice alignment: how closely the draft matches the user's archetype, tone settings, vocabulary, learned preferences, and prior writing patterns. 10 means it sounds like a continuation of their strongest prior posts. 1 means it does not sound like them at all.
2. Performance alignment: how likely the draft is to support the selected KPI based on the user's actual prior post performance and the rules of LinkedIn engagement. 10 means it is well positioned. 1 means it is poorly positioned.

Selected KPI: ${args.kpi ?? "(none specified — score performance against the user's stated LinkedIn goal)"}

Be honest. Do not inflate scores. If you cite evidence from the user's prior posts, return their post IDs in evidence_post_ids. If evidence is sparse, set confidence to "low".

Return JSON ONLY, matching exactly this schema. No markdown, no commentary outside the JSON object.

{
  "voice_score": <integer 1-10>,
  "performance_score": <integer 1-10>,
  "voice_rationale": "<2-4 sentences, specific>",
  "performance_rationale": "<2-4 sentences, specific>",
  "tradeoff_summary": "<1-3 sentences, only if the two scores diverge meaningfully>",
  "evidence_post_ids": [<post_id strings or empty>],
  "confidence": "low" | "medium" | "high"
}

DRAFT:
"""
${args.draft}
"""`;
}

export function buildImprovePrompt(args: {
  draft: string;
  kpi?: SelectedKpi;
  voiceScore: number;
  performanceScore: number;
}): string {
  return `Analyze the draft below and produce improvement recommendations.

Selected KPI: ${args.kpi ?? "(none — improve toward the user's stated LinkedIn goal)"}
Current voice score: ${args.voiceScore}/10
Current performance score: ${args.performanceScore}/10

Return TWO paths if there is a meaningful difference between optimising for voice and optimising for the KPI. If they align, return one combined path with path_type = "balanced".

Each recommendation must include specific suggested replacement text. No vague advice. No clickbait. No em dashes. No broetry. Reference the user's actual prior posts (by post_id in evidence_post_id) when relevant.

PLACEMENT METADATA (critical for the app to apply the change in the right spot):

For every recommendation also include:
- "change_type": one of "replace" | "insert_after" | "insert_before" | "append" | "trim"
  - "replace": swap a specific chunk of the original draft for new text.
  - "insert_after": add new text immediately after a specific anchor in the draft.
  - "insert_before": add new text immediately before a specific anchor.
  - "append": add new text at the end. Use this if no good anchor exists.
  - "trim": remove a specific chunk with no replacement.
- "target_text": the EXACT verbatim substring of the original draft this change targets, character-for-character (including punctuation, capitalisation, and line breaks). Required for "replace" and "trim". Empty string otherwise.
- "anchor_text": the EXACT verbatim substring of the original draft to attach the new text to. Required for "insert_after" and "insert_before". Empty string otherwise.

CRITICAL: target_text and anchor_text MUST be exact substrings of the original draft. Do not paraphrase. Do not summarise. If you cannot find an exact substring to anchor to, use change_type "append" so the new text lands at the end of the draft. The "what_to_change" field is for the user-readable description and CAN be a paraphrase; target_text and anchor_text cannot.

Return JSON ONLY, matching exactly this schema:

{
  "paths": [
    {
      "path_type": "voice" | "performance" | "balanced",
      "summary": "<1-2 sentences describing the path>",
      "recommendations": [
        {
          "title": "<short label>",
          "change_type": "replace" | "insert_after" | "insert_before" | "append" | "trim",
          "target_text": "<exact substring of the original draft, or empty>",
          "anchor_text": "<exact substring of the original draft, or empty>",
          "what_to_change": "<plain English description for the user>",
          "why_it_matters": "<plain English, references user's voice or evidence>",
          "suggested_replacement_text": "<the exact text to drop in>",
          "voice_impact": "positive" | "neutral" | "negative",
          "performance_impact": "positive" | "neutral" | "negative",
          "evidence_post_id": <string or null>
        }
      ]
    }
  ],
  "tradeoff_summary": "<1-3 sentences if voice and performance pull apart, otherwise empty string>"
}

DRAFT:
"""
${args.draft}
"""`;
}

export function buildInspirePrompt(args: {
  count: number;
  dismissed: string[];
  saved: string[];
}): string {
  const dismissedNote =
    args.dismissed.length > 0
      ? `Avoid suggesting topics similar to these recently dismissed ideas: ${args.dismissed.join(" | ")}.`
      : "";
  const savedNote =
    args.saved.length > 0
      ? `The user already saved these ideas, do not repeat them: ${args.saved.join(" | ")}.`
      : "";

  return `Generate ${args.count} LinkedIn post ideas for this user.

The ideas must include a mix of source types:
- performance_pattern: builds on a topic or angle that already worked for them.
- adjacent_theme: a fresh angle related to what worked but in a new direction (e.g. apply their leadership-vulnerability voice to founder pricing).
- voice_gap: addresses something their voice profile says they care about but their post history under-represents.

Each idea must explain WHY it is being suggested. Use the user's actual post history when available (cite post_ids in evidence_post_ids). No generic content-calendar fillers.

${dismissedNote}
${savedNote}

Return JSON ONLY, matching exactly this schema:

{
  "ideas": [
    {
      "title": "<short, specific>",
      "suggested_angle": "<2-3 sentences describing the angle>",
      "why_this": "<2-3 sentences, references user voice or evidence>",
      "source_type": "performance_pattern" | "adjacent_theme" | "voice_gap" | "trend" | "manual_seed",
      "evidence_post_ids": [<post_id strings or empty>],
      "workshop_seed_prompt": "<one short sentence the user can drop into Workshop>"
    }
  ]
}`;
}

export function buildOptimizePrompt(args: {
  draft: string;
  target: "voice" | "performance" | "balanced";
  kpi?: SelectedKpi;
}): string {
  return `Rewrite the draft below according to the optimisation target.

Target: ${args.target}
Selected KPI: ${args.kpi ?? "(none — use the user's stated LinkedIn goal)"}

If target is "voice", improve how much it sounds like the user while keeping the core idea.
If target is "performance", improve KPI potential and explicitly call out any risk to voice alignment in tradeoff_summary.
If target is "balanced", improve both without letting either dominate.

Return a LinkedIn-ready draft with natural paragraph breaks (blank lines between paragraphs, 2-4 sentences each). No em dashes. No broetry. No generic phrasing.

Return JSON ONLY:

{
  "optimized_draft": "<full rewritten post, paragraph-formatted>",
  "what_changed": "<2-4 sentences describing what you changed and why>",
  "voice_score_estimate": <integer 1-10>,
  "performance_score_estimate": <integer 1-10>,
  "tradeoff_summary": "<1-3 sentences when relevant, empty string otherwise>"
}

DRAFT:
"""
${args.draft}
"""`;
}

export function buildExtractPreferencesPrompt(args: {
  events: Array<{
    feedback_event_id: string;
    event_type: string;
    raw_content_before: string | null;
    raw_content_after: string | null;
    user_note: string | null;
    created_at: string;
  }>;
  existingPreferenceTypes: string[];
}): string {
  const eventsBlock = args.events
    .map(
      (e) =>
        `- id: ${e.feedback_event_id}\n  type: ${e.event_type}\n  note: ${e.user_note ?? ""}\n  before: ${(e.raw_content_before ?? "").slice(0, 400)}\n  after:  ${(e.raw_content_after ?? "").slice(0, 400)}`,
    )
    .join("\n");

  return `Review the recent feedback events below and identify recurring user preferences.

Only emit a preference when the same pattern appears in 3 or more events, or when the user explicitly stated a preference in a note. Do not overfit to one-off edits.

Existing preference types already captured for this user (do not duplicate unless the new evidence sharply updates them): ${args.existingPreferenceTypes.join(", ") || "(none)"}

Each preference must have a human-readable summary AND a prompt_instruction that can be injected into future generation calls. Confidence is a number between 0 and 1 reflecting how strong the pattern is in the evidence.

Return JSON ONLY:

{
  "learned_preferences": [
    {
      "preference_type": "cta_style" | "opening_style" | "vulnerability_level" | "post_length" | "tone" | "structure" | "vocabulary" | "topic_angle" | "formatting",
      "preference_summary": "<one sentence the user could read>",
      "prompt_instruction": "<one or two sentences for future LLM prompts>",
      "confidence": <number between 0 and 1>,
      "evidence_event_ids": [<feedback_event_id strings>],
      "suggested_status": "suggested" | "active"
    }
  ]
}

If no clear pattern emerges, return {"learned_preferences": []}.

EVENTS:
${eventsBlock}`;
}

// Re-export the legacy Workshop helpers for backwards compatibility.
export { buildHistoryContext, loadVoiceContextPosts };
