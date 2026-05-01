/**
 * Content rule enforcement.
 *
 * Two rules are HARD constraints PowerPost-wide and must be enforced in both
 * prompts and post-generation validation:
 *
 *   1. No em-dashes (—). Em-dashes signal AI-generated content and undermine
 *      authenticity. Replace with periods or rephrase.
 *   2. No broetry. Every paragraph must contain complete, connected thoughts of
 *      at least two sentences. Stacked single-sentence paragraphs are banned.
 */

export type ValidationFlag =
  | { rule: "em_dash"; count: number }
  | { rule: "broetry"; offending_paragraph_indexes: number[] };

const EM_DASH_PATTERN = /[—\u2014\u2013]/g; // em-dash and en-dash both stripped

const SENTENCE_TERMINATORS = /[.!?]['")\]]?\s+/g;

function paragraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

function countSentences(paragraph: string): number {
  // Count terminators + 1 if final char is a terminator-ending sentence.
  const terminatorMatches = paragraph.match(SENTENCE_TERMINATORS);
  const trailingTerminator = /[.!?]['")\]]?$/.test(paragraph) ? 1 : 0;
  return (terminatorMatches?.length ?? 0) + trailingTerminator;
}

export function stripEmDashes(text: string): string {
  // Replace em/en dash with period+space so the structural rhythm is preserved
  // when used as a clause separator. Then normalise double spaces.
  return text.replace(EM_DASH_PATTERN, ".").replace(/\.\s*\./g, ".").replace(/\s{2,}/g, " ");
}

export function detectBroetry(text: string): number[] {
  const paras = paragraphs(text);
  const offenders: number[] = [];
  paras.forEach((para, idx) => {
    if (countSentences(para) < 2) {
      offenders.push(idx);
    }
  });
  return offenders;
}

export function validate(text: string): { flags: ValidationFlag[] } {
  const flags: ValidationFlag[] = [];
  const dashMatches = text.match(EM_DASH_PATTERN);
  if (dashMatches && dashMatches.length > 0) {
    flags.push({ rule: "em_dash", count: dashMatches.length });
  }
  const offenders = detectBroetry(text);
  if (offenders.length > 0) {
    flags.push({ rule: "broetry", offending_paragraph_indexes: offenders });
  }
  return { flags };
}

/**
 * Best-effort automatic remediation. Strips em-dashes and merges adjacent
 * single-sentence paragraphs together. The result is then re-validated and
 * remaining flags surfaced in response metadata so the caller knows what was
 * changed.
 */
export function remediate(text: string): { text: string; flags: ValidationFlag[] } {
  let working = stripEmDashes(text);

  const paras = paragraphs(working);
  const merged: string[] = [];
  let buffer = "";
  for (const para of paras) {
    const sentenceCount = countSentences(para);
    if (sentenceCount < 2) {
      buffer = buffer ? `${buffer} ${para}` : para;
      // If the merged buffer now has 2+ sentences, flush it.
      if (countSentences(buffer) >= 2) {
        merged.push(buffer);
        buffer = "";
      }
    } else {
      if (buffer) {
        // Attach hanging buffer to this paragraph.
        merged.push(`${buffer} ${para}`.trim());
        buffer = "";
      } else {
        merged.push(para);
      }
    }
  }
  if (buffer) {
    if (merged.length > 0) {
      merged[merged.length - 1] = `${merged[merged.length - 1]} ${buffer}`.trim();
    } else {
      merged.push(buffer);
    }
  }

  working = merged.join("\n\n");
  const { flags } = validate(working);
  return { text: working, flags };
}
