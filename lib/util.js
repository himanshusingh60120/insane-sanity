// Shared helpers. Everything here is pure and deterministic — no network, no AI.

/** Collapse whitespace but keep a record of what was collapsed. */
export function norm(s = '') {
  return String(s).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Visible rendering of invisible characters, used in the evidence panel. */
export function reveal(s = '') {
  return String(s)
    .replace(/\u00a0/g, '⍽')
    .replace(/ {2,}/g, (m) => '·'.repeat(m.length))
    .replace(/\t/g, '→')
    .replace(/\n/g, '⏎');
}

/** Words that stay lowercase inside a Title Case heading, unless first or last. */
export const MINOR_WORDS = new Set([
  'a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'from', 'in', 'into', 'nor',
  'of', 'on', 'onto', 'or', 'over', 'per', 'the', 'to', 'up', 'via', 'vs', 'with',
]);

/**
 * Tokens that are legitimately all-caps and must never be treated as a casing
 * error. Extend this list rather than loosening the rule.
 */
export const ALLOWED_UPPER = new Set([
  'U.S.', 'US', 'UK', 'UAE', 'U.A.E.', 'EU', 'APAC', 'MEA', 'LATAM', 'CAGR',
  'USD', 'GDP', 'AI', 'ML', 'IT', 'ICT', 'IOT', 'IT/OT', 'R&D', 'CRO', 'CROS',
  'CDMO', 'FDA', 'NIH', 'NCI', 'EPA', 'FFPE', 'DNA', 'RNA', 'PCR', 'NGS',
  'ASIC', 'OOC', 'BFSI', '5G', '6G', 'EV', 'EVS', 'ADAS', 'SME', 'SMES',
  'B2B', 'B2C', 'OEM', 'OEMS', 'GDPR', 'ESG', 'CEO', 'CTO', 'LOS', 'HVAC',
  'LED', 'UV', 'IR', 'API', 'APIS', 'SaaS', 'GPU', 'CPU', 'TOC', 'FAQ', 'FAQS',
  'EGCG', 'NAFLD', 'MASLD', 'GLP', 'IHC', 'PEF', 'SFE', 'UAE', 'MAE', 'EAE',
]);

const WORDLIKE = /[A-Za-z]/;

/** True when the string is entirely upper-case letters and is not an allowed acronym. */
export function isShoutingCase(text) {
  const t = norm(text);
  if (!t || !WORDLIKE.test(t)) return false;
  const words = t.split(/\s+/).filter((w) => WORDLIKE.test(w));
  if (words.length === 0) return false;

  // Every word must be upper-case for the string to count as ALL CAPS.
  const allUpper = words.every((w) => w === w.toUpperCase());
  if (!allUpper) return false;

  // A run of two or more real words in caps is a formatting problem. A single
  // token that is a known acronym is not.
  const meaningful = words.filter((w) => !ALLOWED_UPPER.has(stripPunct(w).toUpperCase()));
  if (meaningful.length === 0) return false;
  return meaningful.some((w) => stripPunct(w).length >= 3) || words.length >= 3;
}

export function stripPunct(w = '') {
  return String(w).replace(/^[^\w.&]+|[^\w.&]+$/g, '');
}

/**
 * Rewrites a heading into house Title Case: first and last word capitalised,
 * minor words lowercased, known acronyms preserved.
 */
export function toTitleCase(text) {
  const words = norm(text).split(' ');
  return words
    .map((w, i) => {
      const bare = stripPunct(w);
      if (ALLOWED_UPPER.has(bare.toUpperCase()) && bare.toUpperCase() === bare) return w;
      if (ALLOWED_UPPER.has(bare.toUpperCase())) return w.replace(bare, bare.toUpperCase());
      const lower = w.toLowerCase();
      const isMinor = MINOR_WORDS.has(stripPunct(lower));
      if (i !== 0 && i !== words.length - 1 && isMinor) return lower;
      // Preserve internal capitals like "Organ-on-a-Chip" and "Bio-Techne".
      if (/[A-Z]/.test(w.slice(1))) return w;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

/** Parse "USD 343.3 million" / "$33.08B" / "USD 1,251.9 million" into a number of millions. */
export function parseMoneyToMillions(raw) {
  const s = norm(raw).replace(/,/g, '');
  const m = s.match(/(?:USD|US\$|\$)\s*([\d.]+)\s*(million|billion|trillion|M|B|T)?\b/i);
  if (!m) return null;
  const value = parseFloat(m[1]);
  if (!Number.isFinite(value)) return null;
  const unit = (m[2] || 'million').toLowerCase();
  const mult = unit.startsWith('b') ? 1000 : unit.startsWith('t') ? 1_000_000 : 1;
  return value * mult;
}

export function cagr(start, end, years) {
  if (!start || !end || !years) return null;
  return (Math.pow(end / start, 1 / years) - 1) * 100;
}

export function round(n, dp = 2) {
  return Math.round(n * 10 ** dp) / 10 ** dp;
}

export function slugify(s = '') {
  return norm(s)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Cut a quotation around a match so the evidence line stays readable. */
export function context(haystack, needle, pad = 55) {
  const i = haystack.indexOf(needle);
  if (i === -1) return norm(needle);
  const start = Math.max(0, i - pad);
  const end = Math.min(haystack.length, i + needle.length + pad);
  return (start > 0 ? '…' : '') + haystack.slice(start, end) + (end < haystack.length ? '…' : '');
}

export function unique(arr) {
  return Array.from(new Set(arr));
}

/** Run promises with a concurrency cap so link checking does not hammer the site. */
export async function pool(items, limit, worker) {
  const results = [];
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

/**
 * Levenshtein distance, iterative with a single row. Used to check that a
 * proposed correction is actually a correction of the text it quotes rather
 * than an unrelated replacement.
 */
export function editDistance(a = '', b = '') {
  const s = String(a);
  const t = String(b);
  if (s === t) return 0;
  if (!s.length) return t.length;
  if (!t.length) return s.length;

  let prev = Array.from({ length: t.length + 1 }, (_, i) => i);
  for (let i = 1; i <= s.length; i += 1) {
    const row = [i];
    for (let j = 1; j <= t.length; j += 1) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev = row;
  }
  return prev[t.length];
}

/** 1.0 for identical strings, 0.0 for completely unrelated ones. */
export function similarity(a = '', b = '') {
  const longest = Math.max(String(a).length, String(b).length);
  if (!longest) return 1;
  return 1 - editDistance(a, b) / longest;
}

/** Words the model wrapped in quotes inside its own note, e.g. the word 'cer'. */
export function quotedTokens(text = '') {
  return Array.from(String(text).matchAll(/['"“”‘’]([^'"“”‘’]{2,40})['"“”‘’]/g)).map((m) => m[1].trim());
}
