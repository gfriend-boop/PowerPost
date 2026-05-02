import crypto from "node:crypto";

/** Normalise a draft for cache-key comparison. Whitespace-only differences
 *  hash identically; meaningful edits do not. */
export function hashDraft(draft: string): string {
  const normalised = draft.replace(/\s+/g, " ").trim().toLowerCase();
  return crypto.createHash("sha256").update(normalised).digest("hex");
}
