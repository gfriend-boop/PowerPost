/**
 * Archetype assignment engine.
 *
 * Snippet picks carry 60% of the assignment weight (split across the three picks).
 * Goal calibration carries 25%. Vocabulary + "never be mistaken for" carry 15%.
 *
 * The Revealer is the only archetype with a dual-signal requirement: it is
 * never assigned unless both storytelling AND provocation signals are in the
 * top tier from snippet picks. We approximate "top tier" as the user picking
 * the story-led hook AND the bold/challenger hook scoring as a close second
 * via the vocabulary/"never be mistaken for" guards.
 *
 * Tie-break: prefer the archetype whose hook (Pick #1) was selected, since
 * hook style is the strongest single indicator of natural voice.
 */

export type ArchetypeKey =
  | "the_owner"
  | "the_igniter"
  | "the_narrator"
  | "the_architect"
  | "the_challenger"
  | "the_revealer";

export const ARCHETYPE_KEYS: ArchetypeKey[] = [
  "the_owner",
  "the_igniter",
  "the_narrator",
  "the_architect",
  "the_challenger",
  "the_revealer",
];

// Weights split inside each phase (snippet picks=60, goal=25, vocab=15).
const W_HOOK = 30; // out of 60
const W_OPENING = 18;
const W_CTA = 12;
const W_GOAL = 25;
const W_NEVER = 10;
const W_VOCAB = 5;

type LinkedInGoal =
  | "inbound_leads"
  | "thought_leadership"
  | "career_visibility"
  | "speaking"
  | "board_role"
  | "network_growth";

const HOOK_SIGNALS: Record<string, ArchetypeKey[]> = {
  hook_a_direct: ["the_owner", "the_architect"],
  hook_b_story: ["the_narrator", "the_igniter", "the_revealer"],
  hook_c_challenger: ["the_challenger", "the_revealer"],
};

const OPENING_SIGNALS: Record<string, ArchetypeKey[]> = {
  opening_a_data: ["the_owner", "the_architect", "the_challenger"],
  opening_b_personal: ["the_narrator", "the_igniter", "the_revealer"],
};

const CTA_SIGNALS: Record<string, ArchetypeKey[]> = {
  cta_a_direct: ["the_owner", "the_architect", "the_challenger"],
  cta_b_reflective: ["the_narrator", "the_igniter", "the_revealer"],
};

const GOAL_SIGNALS: Record<LinkedInGoal, ArchetypeKey[]> = {
  inbound_leads: ["the_narrator"],
  thought_leadership: ["the_owner", "the_architect", "the_challenger", "the_igniter"],
  career_visibility: ["the_owner", "the_architect"],
  speaking: ["the_igniter", "the_challenger"],
  board_role: ["the_architect"],
  network_growth: ["the_narrator", "the_igniter"],
};

const NEVER_BE_MISTAKEN_KEYWORDS: Record<string, ArchetypeKey[]> = {
  soft: ["the_owner", "the_architect"],
  vague: ["the_owner", "the_architect"],
  "wishy-washy": ["the_owner", "the_architect", "the_challenger"],
  "fence-sitter": ["the_challenger"],
  "people pleaser": ["the_challenger"],
  corporate: ["the_narrator"],
  generic: ["the_narrator"],
  salesy: ["the_narrator"],
  performative: ["the_revealer"],
  fake: ["the_revealer"],
};

const NEVER_BE_MISTAKEN_PENALTIES: Record<string, ArchetypeKey[]> = {
  // Picking these as your "never" should DOWN-rank archetypes that lean that way.
  preachy: ["the_igniter"],
  empty: ["the_igniter"],
  motivational: ["the_igniter"],
  salesperson: ["the_owner"],
  cold: ["the_architect"],
  "rigid": ["the_architect"],
  "boring": ["the_owner", "the_architect"],
  "provocative": ["the_challenger", "the_revealer"],
};

export type AssignmentInput = {
  hookPick: string; // snippet_key
  openingPick: string;
  ctaPick: string;
  linkedInGoal: LinkedInGoal;
  neverBeMistakenFor: string;
  vocabularyAvoids: string[];
  vocabularyFavors: string[];
};

export type AssignmentResult = {
  archetype: ArchetypeKey;
  alternative: ArchetypeKey | null;
  scores: Record<ArchetypeKey, number>;
};

function emptyScores(): Record<ArchetypeKey, number> {
  return {
    the_owner: 0,
    the_igniter: 0,
    the_narrator: 0,
    the_architect: 0,
    the_challenger: 0,
    the_revealer: 0,
  };
}

function applySignals(
  scores: Record<ArchetypeKey, number>,
  signals: ArchetypeKey[] | undefined,
  weight: number,
): void {
  if (!signals || signals.length === 0) return;
  // Distribute weight across signaled archetypes so picks that signal multiple
  // archetypes don't unfairly outweigh single-signal picks.
  const share = weight / signals.length;
  for (const key of signals) {
    scores[key] += share;
  }
}

function applyKeywordSignals(
  scores: Record<ArchetypeKey, number>,
  freeText: string,
  weight: number,
): void {
  const haystack = freeText.toLowerCase();
  for (const [keyword, signals] of Object.entries(NEVER_BE_MISTAKEN_KEYWORDS)) {
    if (haystack.includes(keyword)) {
      applySignals(scores, signals, weight / 2);
    }
  }
  for (const [keyword, penalties] of Object.entries(NEVER_BE_MISTAKEN_PENALTIES)) {
    if (haystack.includes(keyword)) {
      for (const key of penalties) {
        scores[key] -= weight / 2;
      }
    }
  }
}

export function assignArchetype(input: AssignmentInput): AssignmentResult {
  const scores = emptyScores();

  applySignals(scores, HOOK_SIGNALS[input.hookPick], W_HOOK);
  applySignals(scores, OPENING_SIGNALS[input.openingPick], W_OPENING);
  applySignals(scores, CTA_SIGNALS[input.ctaPick], W_CTA);
  applySignals(scores, GOAL_SIGNALS[input.linkedInGoal], W_GOAL);
  applyKeywordSignals(scores, input.neverBeMistakenFor, W_NEVER);

  // Vocabulary signals are a small nudge: hedging-language avoids favor the_challenger,
  // corporate-buzzword avoids favor the_narrator/the_revealer.
  const avoids = input.vocabularyAvoids.join(" ").toLowerCase();
  if (avoids.match(/\b(maybe|perhaps|kind of|sort of|i think)\b/)) {
    applySignals(scores, ["the_challenger", "the_owner"], W_VOCAB);
  }
  if (avoids.match(/\b(synergy|leverage|circle back|alignment|stakeholder)\b/)) {
    applySignals(scores, ["the_narrator", "the_revealer"], W_VOCAB);
  }

  // The Revealer dual-signal guard: requires hook_b_story AND signals from
  // the bold/challenger family (either hook would have been C, or "never be
  // mistaken for" includes performative/fake terms, or vocabulary explicitly
  // avoids hedging language).
  const hasHighStorytelling = input.hookPick === "hook_b_story";
  const hasHighProvocation =
    input.hookPick === "hook_c_challenger" ||
    /performative|fake|tone.it.down/.test(input.neverBeMistakenFor.toLowerCase()) ||
    Boolean(avoids.match(/\b(maybe|perhaps|kind of|sort of)\b/));
  if (!(hasHighStorytelling && hasHighProvocation)) {
    scores.the_revealer = Math.min(scores.the_revealer, 0);
  }

  // Find top + alternative (second-place if within 15% of top).
  const sorted = ARCHETYPE_KEYS
    .map((k) => ({ key: k, score: scores[k] }))
    .sort((a, b) => b.score - a.score);

  const top = sorted[0]!;
  const second = sorted[1];

  // Tie-break: prefer the archetype whose hook (Pick #1) was selected.
  const hookSignals = HOOK_SIGNALS[input.hookPick] ?? [];
  const candidates = sorted.filter((s) => Math.abs(s.score - top.score) < 0.0001);
  let chosen = top.key;
  if (candidates.length > 1) {
    const tieBreaker = candidates.find((c) => hookSignals.includes(c.key));
    if (tieBreaker) chosen = tieBreaker.key;
  }

  // Ambiguity rule: when signals are close between two archetypes, surface the
  // alternative in the reveal UI. We define "close" as second within 15% of top.
  let alternative: ArchetypeKey | null = null;
  if (second && top.score > 0 && second.key !== chosen) {
    const ratio = second.score / top.score;
    if (ratio >= 0.85) {
      alternative = second.key;
    }
  }

  return { archetype: chosen, alternative, scores };
}
