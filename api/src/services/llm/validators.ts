/**
 * Content rule enforcement.
 *
 * Two rules are HARD constraints PowerPost-wide and must be enforced in both
 * prompts and post-generation validation:
 *
 *   1. No em-dashes (—). Em-dashes signal AI-generated content and undermine
 *      authenticity. Replace with periods or rephrase.
 *   2. No broetry. Inside a single block (text between blank lines), every
 *      sentence on its own line is forbidden. Lines must group into
 *      paragraphs of 2 or more connected sentences.
 *   3. Output must be paragraph-formatted: distinct ideas separated by blank
 *      lines, no single newlines inside a paragraph.
 */

export type ValidationFlag =
  | { rule: "em_dash"; count: number }
  | { rule: "broetry"; offending_block_indexes: number[] }
  | { rule: "missing_paragraph_breaks"; sentence_count: number }
  | { rule: "banned_phrase"; phrases: string[] };

/**
 * Phrases banned outright unless they're explicitly explained. Sourced from
 * the Phase 2 Prompt System Spec, section "Suggested banned generic phrases".
 */
const BANNED_PHRASES = [
  "boost engagement",
  "maximize impact",
  "drive value",
  "hook your audience",
  "thought leadership content",
  "game changer",
  "unlock your potential",
  "level up",
];

export function detectBannedPhrases(text: string): string[] {
  const lower = text.toLowerCase();
  return BANNED_PHRASES.filter((p) => lower.includes(p));
}

/**
 * Parses a JSON object out of an LLM reply. The model is asked to return
 * pure JSON, but in practice Anthropic occasionally wraps it in prose or a
 * code fence. This is tolerant about both.
 */
export function parseLooseJson<T = unknown>(raw: string): T | null {
  let candidate = raw.trim();

  // Strip a leading markdown code fence opener if present, even when there's
  // no matching close. (LLMs sometimes return ``` json\n{...} without
  // closing the fence, especially when the response is long.)
  candidate = candidate.replace(/^```(?:json|JSON)?\s*\n?/, "");
  // Strip a trailing fence if present.
  candidate = candidate.replace(/\n?```\s*$/, "");
  candidate = candidate.trim();
  if (!candidate) return null;

  // Find the outermost JSON object braces.
  const firstBrace = candidate.indexOf("{");
  const firstBracket = candidate.indexOf("[");
  let start: number;
  let openChar: "{" | "[";
  if (firstBrace === -1 && firstBracket === -1) return null;
  if (firstBracket !== -1 && (firstBrace === -1 || firstBracket < firstBrace)) {
    start = firstBracket;
    openChar = "[";
  } else {
    start = firstBrace;
    openChar = "{";
  }
  const closeChar = openChar === "{" ? "}" : "]";
  const lastClose = candidate.lastIndexOf(closeChar);
  if (lastClose <= start) return null;
  const slice = candidate.slice(start, lastClose + 1);
  try {
    return JSON.parse(slice) as T;
  } catch {
    return null;
  }
}

const EM_DASH_PATTERN = /[—\u2014\u2013]/g; // em-dash and en-dash both stripped

const SENTENCE_TERMINATORS = /[.!?]['")\]]?\s+/g;

function blocks(text: string): string[] {
  // A "block" is text between blank lines. Two or more newlines (with
  // possible whitespace between) delimit blocks.
  return text
    .split(/\n[\t ]*\n+/)
    .map((b) => b.trim())
    .filter((b) => b.length > 0);
}

function linesIn(block: string): string[] {
  return block
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

function countSentences(text: string): number {
  const terminatorMatches = text.match(SENTENCE_TERMINATORS);
  const trailingTerminator = /[.!?]['")\]]?$/.test(text.trim()) ? 1 : 0;
  return (terminatorMatches?.length ?? 0) + trailingTerminator;
}

function isBroetryBlock(block: string): boolean {
  const ls = linesIn(block);
  if (ls.length < 2) return false;
  // If all (or all but one) of the lines in this block are 0-1 sentence each,
  // we treat it as broetry that needs to be joined into a paragraph.
  const shortLines = ls.filter((l) => countSentences(l) <= 1).length;
  return shortLines >= ls.length - 1;
}

export function stripEmDashes(text: string): string {
  return text.replace(EM_DASH_PATTERN, ".").replace(/\.\s*\./g, ".").replace(/\s{2,}/g, " ");
}

export function validate(text: string): { flags: ValidationFlag[] } {
  const flags: ValidationFlag[] = [];

  const dashMatches = text.match(EM_DASH_PATTERN);
  if (dashMatches && dashMatches.length > 0) {
    flags.push({ rule: "em_dash", count: dashMatches.length });
  }

  const blks = blocks(text);
  const broetryBlocks: number[] = [];
  blks.forEach((b, i) => {
    if (isBroetryBlock(b)) broetryBlocks.push(i);
  });
  if (broetryBlocks.length > 0) {
    flags.push({ rule: "broetry", offending_block_indexes: broetryBlocks });
  }

  // If the entire output is one giant block with many sentences, it's missing
  // paragraph breaks for LinkedIn readability.
  if (blks.length === 1 && countSentences(blks[0] ?? "") >= 6) {
    flags.push({ rule: "missing_paragraph_breaks", sentence_count: countSentences(blks[0] ?? "") });
  }

  const banned = detectBannedPhrases(text);
  if (banned.length > 0) {
    flags.push({ rule: "banned_phrase", phrases: banned });
  }

  return { flags };
}

/**
 * Best-effort automatic remediation:
 *   - Strip em/en dashes.
 *   - Convert broetry blocks (stacked single-sentence lines) into one
 *     paragraph by joining lines with a single space.
 *   - If a paragraph then exceeds ~5 sentences, break it on natural
 *     transitions ("But", "So", "Here is", "The...", etc) into 2-3 sentence
 *     chunks separated by blank lines.
 *   - If the entire response is one giant paragraph, split it into ~3-sentence
 *     paragraphs so LinkedIn readers actually engage with it.
 *
 * Output paragraphs are joined with `\n\n` so the rendering layer can split on
 * blank lines and render each as its own visible paragraph.
 */
export function remediate(text: string): { text: string; flags: ValidationFlag[] } {
  let working = stripEmDashes(text).trim();
  if (!working) return { text: "", flags: [] };

  const blks = blocks(working);
  const repaired: string[] = [];
  for (const block of blks) {
    if (isBroetryBlock(block)) {
      // Join the stacked lines into one paragraph and then chunk if too long.
      const joined = linesIn(block).join(" ");
      repaired.push(...chunkBySentences(joined, 3));
    } else {
      // Multi-line block where lines have multi-sentence content. Replace any
      // remaining single newlines with a space to keep it as one paragraph,
      // then chunk if needed.
      const flat = block.replace(/\n+/g, " ").replace(/\s{2,}/g, " ");
      const sentenceCount = countSentences(flat);
      if (sentenceCount > 5) {
        repaired.push(...chunkBySentences(flat, 3));
      } else {
        repaired.push(flat);
      }
    }
  }

  // Edge case: if input was a single mega-paragraph (no blank lines anywhere),
  // chunk it for readability.
  if (repaired.length === 1 && countSentences(repaired[0] ?? "") > 5) {
    const only = repaired[0] ?? "";
    repaired.length = 0;
    repaired.push(...chunkBySentences(only, 3));
  }

  working = repaired.join("\n\n");
  const { flags } = validate(working);
  return { text: working, flags };
}

/**
 * Split text into chunks of approximately `target` sentences each. Keeps
 * sentence boundaries intact. Used to break overly long paragraphs.
 */
function chunkBySentences(text: string, target: number): string[] {
  // Capture sentences with their trailing terminator + whitespace.
  const matches = text.match(/[^.!?]+[.!?]['")\]]?\s*/g);
  if (!matches || matches.length <= target) return [text.trim()];

  const out: string[] = [];
  for (let i = 0; i < matches.length; i += target) {
    const slice = matches
      .slice(i, i + target)
      .join("")
      .trim();
    if (slice) out.push(slice);
  }
  return out;
}
