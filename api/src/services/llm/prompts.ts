import { pool } from "../../db/pool.js";

export type VoiceProfileForPrompt = {
  archetype: string;
  archetype_display: string;
  archetype_who_this_is: string;
  archetype_sample_post: string;
  tone_warmth: number;
  tone_storytelling: number;
  tone_provocation: number;
  topic_authorities: string[];
  topic_exclusions: string[];
  vocabulary_favors: string[];
  vocabulary_avoids: string[];
  linkedin_goal: string;
  target_audience: string;
  posting_cadence: string;
  signature_phrases: string[];
  snippet_pick_hook_body: string | null;
  snippet_pick_opening_body: string | null;
  snippet_pick_cta_body: string | null;
  role_identity: string | null;
  never_be_mistaken_for: string | null;
};

export async function loadVoiceProfileForPrompt(
  userId: string,
): Promise<VoiceProfileForPrompt | null> {
  const { rows } = await pool.query(
    `SELECT vp.*, a.display_name AS archetype_display, a.who_this_is AS archetype_who, a.sample_post AS archetype_sample,
            sh.body AS hook_body, so.body AS opening_body, sc.body AS cta_body
       FROM voice_profiles vp
       LEFT JOIN archetypes a ON a.archetype_key = vp.archetype
       LEFT JOIN snippets sh ON sh.snippet_key = vp.snippet_pick_hook
       LEFT JOIN snippets so ON so.snippet_key = vp.snippet_pick_opening
       LEFT JOIN snippets sc ON sc.snippet_key = vp.snippet_pick_cta
      WHERE vp.user_id = $1`,
    [userId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    archetype: row.archetype,
    archetype_display: row.archetype_display ?? row.archetype,
    archetype_who_this_is: row.archetype_who ?? "",
    archetype_sample_post: row.archetype_sample ?? "",
    tone_warmth: row.tone_warmth,
    tone_storytelling: row.tone_storytelling,
    tone_provocation: row.tone_provocation,
    topic_authorities: row.topic_authorities ?? [],
    topic_exclusions: row.topic_exclusions ?? [],
    vocabulary_favors: row.vocabulary_favors ?? [],
    vocabulary_avoids: row.vocabulary_avoids ?? [],
    linkedin_goal: row.linkedin_goal,
    target_audience: row.target_audience ?? "",
    posting_cadence: row.posting_cadence ?? "regular",
    signature_phrases: row.signature_phrases ?? [],
    snippet_pick_hook_body: row.hook_body ?? null,
    snippet_pick_opening_body: row.opening_body ?? null,
    snippet_pick_cta_body: row.cta_body ?? null,
    role_identity: row.role_identity ?? null,
    never_be_mistaken_for: row.never_be_mistaken_for ?? null,
  };
}

type EngagementPost = { content: string; engagement: number; posted_at: Date };

export async function loadVoiceContextPosts(userId: string): Promise<{
  topPosts: EngagementPost[];
  recentPosts: EngagementPost[];
  hasHistory: boolean;
}> {
  const top = await pool.query<{ content: string; posted_at: Date; eng: string }>(
    `SELECT content, posted_at, (likes + comments + shares)::text AS eng
       FROM posts
      WHERE user_id = $1
      ORDER BY (likes + comments + shares) DESC
      LIMIT 5`,
    [userId],
  );
  const recent = await pool.query<{ content: string; posted_at: Date; eng: string }>(
    `SELECT content, posted_at, (likes + comments + shares)::text AS eng
       FROM posts
      WHERE user_id = $1
      ORDER BY posted_at DESC
      LIMIT 3`,
    [userId],
  );
  const seen = new Set<string>();
  const dedupe = (rows: typeof top.rows): EngagementPost[] =>
    rows
      .filter((r) => {
        if (seen.has(r.content)) return false;
        seen.add(r.content);
        return true;
      })
      .map((r) => ({
        content: r.content.length > 500 ? r.content.slice(0, 500).trimEnd() + "..." : r.content,
        engagement: Number(r.eng),
        posted_at: r.posted_at,
      }));

  const topPosts = dedupe(top.rows);
  const recentPosts = dedupe(recent.rows);
  return {
    topPosts,
    recentPosts,
    hasHistory: topPosts.length + recentPosts.length > 0,
  };
}

const HARD_CONTENT_RULES = `HARD CONTENT RULES (these are non-negotiable and override every other instruction):

1. NEVER use em-dashes (—) or en-dashes (–). Not in any draft. Not for clause separation. Not for stylistic flair. Use periods, commas, or rewrite the sentence. Em-dashes are how AI-generated content reveals itself and PowerPost is built on the opposite of that.

2. NEVER write broetry. Single-sentence stacked lines are forbidden. Every paragraph must contain at least two complete, connected sentences that belong together. If a thought feels like it wants its own line, find the next thought that connects to it and write them as one paragraph.

3. PARAGRAPH FORMATTING (critical for LinkedIn readability):
   - Separate distinct ideas with a single BLANK LINE between paragraphs.
   - Each paragraph should be 2 to 4 sentences. Never one. Rarely more than four.
   - A short post is typically 3 to 5 paragraphs. A longer post is 5 to 7.
   - Do NOT use single newlines inside a paragraph. Inside a paragraph, sentences are separated by spaces only.
   - The output must be ready to copy directly into LinkedIn with paragraph breaks intact.

4. Warm but never saccharine. Direct but never cold. Specific over abstract. Real over performative.`;

export function buildSystemPrompt(profile: VoiceProfileForPrompt): string {
  const sliders = `Tone calibration (1 to 10 scales):
- Warmth: ${profile.tone_warmth}/10 (1 = pure authority, 10 = pure warmth)
- Storytelling: ${profile.tone_storytelling}/10 (1 = insight/data led, 10 = personal story led)
- Provocation: ${profile.tone_provocation}/10 (1 = safe, 10 = provocative)`;

  const sigPhrases =
    profile.signature_phrases.length > 0
      ? `Signature phrases the user reaches for naturally (use at most one per draft, only when it lands): ${profile.signature_phrases.join(" | ")}`
      : "";

  const exclusions =
    profile.topic_exclusions.length > 0
      ? `Topics this user has explicitly excluded. Do not reference them under any circumstance: ${profile.topic_exclusions.join(" | ")}`
      : "";

  const vocab = [
    profile.vocabulary_favors.length > 0
      ? `Words/phrases the user favors: ${profile.vocabulary_favors.join(", ")}`
      : "",
    profile.vocabulary_avoids.length > 0
      ? `Words/phrases the user actively avoids: ${profile.vocabulary_avoids.join(", ")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const snippetAnchors = [
    profile.snippet_pick_hook_body
      ? `Hook style they identify with:\n"${profile.snippet_pick_hook_body}"`
      : "",
    profile.snippet_pick_opening_body
      ? `Opening style they identify with:\n"${profile.snippet_pick_opening_body}"`
      : "",
    profile.snippet_pick_cta_body
      ? `CTA style they identify with:\n"${profile.snippet_pick_cta_body}"`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  return `You are PowerPost, a coaching-grade LinkedIn content collaborator built by PowerSpeak Academy. You write in the user's calibrated voice. You are warm, direct, and refuse to flatten anyone into generic LinkedIn influencer voice.

${HARD_CONTENT_RULES}

USER VOICE PROFILE
Archetype: ${profile.archetype_display}
Archetype description: ${profile.archetype_who_this_is}

Reference sample post for this archetype (use as STYLE anchor only, never copy lines verbatim):
"""
${profile.archetype_sample_post}
"""

${sliders}

LinkedIn goal: ${profile.linkedin_goal}
Target audience: ${profile.target_audience || "not specified"}
Role/identity: ${profile.role_identity || "not specified"}
Never be mistaken for: ${profile.never_be_mistaken_for || "not specified"}
Posting cadence: ${profile.posting_cadence}

${vocab}
${exclusions}
${sigPhrases}

${snippetAnchors ? `STYLISTIC ANCHORS (the user picked these as 'sounds most like me'):\n${snippetAnchors}` : ""}`;
}

export function buildHistoryContext(
  topPosts: EngagementPost[],
  recentPosts: EngagementPost[],
): string {
  if (topPosts.length === 0 && recentPosts.length === 0) {
    return "No historical post context available. Lean entirely on the voice profile and stylistic anchors above.";
  }
  const top = topPosts
    .map((p, i) => `[Top ${i + 1} — engagement ${p.engagement}]\n${p.content}`)
    .join("\n\n");
  const recent = recentPosts
    .map((p, i) => `[Recent ${i + 1}]\n${p.content}`)
    .join("\n\n");
  return `HISTORICAL CONTEXT (the user's actual past posts, for voice fidelity)

Top performing:
${top}

Most recent:
${recent}

Match the cadence and rhythm of these posts. Do not copy phrases. Do not reference these posts directly.`;
}
