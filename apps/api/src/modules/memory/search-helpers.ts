/**
 * Search-side helpers ported from OpenClaw's memory-core extension.
 *
 * - `buildFtsQuery`  — turn a raw user query into a `to_tsquery('simple', ...)`
 *   compatible expression by Unicode-tokenizing then quoting+ANDing each token.
 *   Mirrors `extensions/memory-core/src/memory/hybrid.ts:buildFtsQuery`.
 * - `extractKeywords` — strip multilingual stop words / short fragments / pure
 *   numbers from a conversational query so the FTS-only fallback can broaden
 *   recall when the strict AND query returns nothing.
 *   Mirrors `packages/memory-host-sdk/src/host/query-expansion.ts:extractKeywords`.
 *
 * Both functions are pure and deterministic — no DB or network access.
 */

const TOKEN_RE = /[\p{L}\p{N}_]+/gu;

const STOP_WORDS = new Set<string>([
  // Articles / determiners
  'a', 'an', 'the', 'this', 'that', 'these', 'those',
  // Pronouns
  'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'she', 'it', 'they', 'them',
  // Common verbs / auxiliaries
  'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did',
  'will', 'would', 'could', 'should', 'can', 'may', 'might',
  // Prepositions
  'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'about',
  'into', 'through', 'during', 'before', 'after', 'above', 'below',
  'between', 'under', 'over',
  // Conjunctions / question words
  'and', 'or', 'but', 'if', 'then', 'because', 'as', 'while',
  'when', 'where', 'what', 'which', 'who', 'how', 'why',
  // Vague time references
  'yesterday', 'today', 'tomorrow', 'earlier', 'later', 'recently', 'ago', 'just', 'now',
  // Vague nouns
  'thing', 'things', 'stuff', 'something', 'anything', 'everything', 'nothing',
  // Polite/request words
  'please', 'help', 'find', 'show', 'get', 'tell', 'give',
]);

/**
 * Tokenize the raw query using a Unicode word regex (mirrors OpenClaw).
 * Does NOT lowercase — that's the caller's job (the `simple` tsvector config
 * already lowercases on the column side, so the query side must match).
 */
export function tokenizeQuery(raw: string): string[] {
  return (raw.match(TOKEN_RE) ?? []).map((t) => t.trim()).filter(Boolean);
}

/**
 * Build a strict AND query for `to_tsquery('simple', ...)`.
 * Each token is wrapped in single quotes (single-quote escape doubles the
 * quote, per Postgres convention) and joined with `&`.
 *
 * Returns `null` if the query has no usable tokens.
 */
export function buildFtsQuery(raw: string): string | null {
  const tokens = tokenizeQuery(raw);
  if (tokens.length === 0) return null;
  return tokens
    .map((t) => `'${t.toLowerCase().replace(/'/g, "''")}'`)
    .join(' & ');
}

/**
 * Extract a list of meaningful keywords for the broaden-recall fallback path.
 * Drops stop words, pure numbers, and runs <3 chars long.
 */
export function extractKeywords(raw: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const tok of tokenizeQuery(raw)) {
    const lower = tok.toLowerCase();
    if (STOP_WORDS.has(lower)) continue;
    if (/^\d+$/.test(lower)) continue;
    if (/^[a-z]+$/.test(lower) && lower.length < 3) continue;
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(lower);
  }
  return out;
}
