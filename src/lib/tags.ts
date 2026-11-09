/** Free-form labels on orders and customers ("vip", "bulk", "called twice"). Stored lower-case. */

export const MAX_TAGS = 10;
const MAX_TAG_LENGTH = 30;
const TAG_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} _-]*$/u;

/** Parses a comma-separated tag list. Returns an error message for anything invalid. */
export function parseTags(input: string): { tags: string[]; error: null } | { tags: null; error: string } {
  const tags: string[] = [];
  for (const raw of input.split(",")) {
    const tag = raw.trim().replace(/\s+/g, " ").toLowerCase();
    if (!tag) continue;
    if (tag.length > MAX_TAG_LENGTH) return { tags: null, error: `Tags can be at most ${MAX_TAG_LENGTH} characters.` };
    if (!TAG_PATTERN.test(tag)) return { tags: null, error: "Tags can only use letters, numbers, spaces, - and _." };
    if (!tags.includes(tag)) tags.push(tag);
  }
  if (tags.length > MAX_TAGS) return { tags: null, error: `Use at most ${MAX_TAGS} tags.` };
  return { tags, error: null };
}

export function normalizeTag(value: string | null | undefined): string | null {
  const parsed = parseTags(value ?? "");
  return parsed.tags && parsed.tags.length === 1 ? parsed.tags[0] : null;
}
