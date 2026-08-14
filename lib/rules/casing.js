import { norm, isShoutingCase, toTitleCase, context, stripPunct, MINOR_WORDS } from '../util.js';

/**
 * The rules in this file are the ones that would have caught the miss described
 * in the brief. Two separate failures look identical on screen and are kept
 * apart on purpose:
 *
 *   CASE-01  the HTML source itself is upper-case  → content fix in the CMS
 *   CASE-02  the source is fine, CSS uppercases it → template/CSS fix
 */
export default function casingRules(doc) {
  const issues = [];

  // ── CASE-01 · ALL CAPS in the source ────────────────────────────────────────
  for (const h of doc.headings) {
    if (h.cssUppercase) continue; // handled by CASE-02
    if (!isShoutingCase(h.text)) continue;
    issues.push({
      ruleId: 'CASE-01',
      category: 'Formatting',
      severity: 'fail',
      items: ['F1', 'M14'],
      title: `${h.tag.toUpperCase()} is written in ALL CAPS in the HTML source`,
      where: `${h.tag.toUpperCase()} · content body`,
      found: h.text,
      expected: toTitleCase(h.text),
      fix: `Retype the heading in the CMS as “${toTitleCase(h.text)}”. It is stored upper-case, so no CSS change will fix it.`,
    });
  }

  // ── CASE-02 · uppercase applied by CSS ──────────────────────────────────────
  for (const h of doc.headings) {
    if (!h.cssUppercase) continue;
    issues.push({
      ruleId: 'CASE-02',
      category: 'Formatting',
      severity: 'warn',
      items: ['F2'],
      title: `${h.tag.toUpperCase()} renders upper-case because of CSS, not content`,
      where: `${h.tag.toUpperCase()} · selector ${h.cssUppercase}`,
      found: `${h.text} (source is correctly cased)`,
      expected: 'Title Case on screen',
      fix: `Remove \`text-transform: uppercase\` from \`${h.cssUppercase}\` if headings should read in Title Case. Source content is already correct — do not retype it.`,
    });
  }

  // ── CASE-03 · ALL CAPS table header cells ───────────────────────────────────
  // Baseline: report 3124 and 3129 use “Segmentation / Details”; report 3148
  // uses “SEGMENTATION / DETAILS”. One of the two has to win. House style is
  // Title Case, matching the majority and every H2/H3 on the page.
  doc.tables.forEach((t, ti) => {
    t.headerCells.forEach((cell) => {
      if (!isShoutingCase(cell)) return;
      issues.push({
        ruleId: 'CASE-03',
        category: 'Formatting',
        severity: 'fail',
        items: ['F3', 'R32'],
        title: 'Table header cell is in ALL CAPS',
        where: `Table ${ti + 1} · header row`,
        found: cell,
        expected: toTitleCase(cell),
        fix: `Set the header cell to “${toTitleCase(cell)}”. Table headers elsewhere on the site use Title Case.`,
      });
    });
  });

  // ── CASE-04 · minor words capitalised inside a heading ──────────────────────
  for (const h of doc.headings) {
    if (h.text.endsWith('?')) continue; // question headings are sentence case
    if (h.isSubtitle) continue; // a sentence, not a heading — see parse.js
    if (isShoutingCase(h.text)) continue;
    const words = h.text.split(' ');
    const offenders = words.filter((w, i) => {
      if (i === 0 || i === words.length - 1) return false;
      const bare = stripPunct(w).toLowerCase();
      if (!MINOR_WORDS.has(bare)) return false;
      // "By Technology", "By End User" — a capitalised "By" introducing a
      // segment label is house style, not a casing error.
      if (bare === 'by' && /^[A-Z]/.test(words[i + 1] || '')) return false;
      return w[0] === w[0].toUpperCase() && /[a-z]/i.test(w[0]);
    });
    if (!offenders.length) continue;
    issues.push({
      ruleId: 'CASE-04',
      category: 'Formatting',
      severity: 'fail',
      items: ['F4', 'M14'],
      title: 'Minor words capitalised in a Title Case heading',
      where: `${h.tag.toUpperCase()}`,
      found: h.text,
      expected: toTitleCase(h.text),
      fix: `Lowercase ${offenders.map((o) => `“${o}”`).join(', ')} → “${toTitleCase(h.text)}”.`,
    });
  }

  // ── CASE-05 · question headings must be sentence case, not Title Case ───────
  for (const h of doc.headings) {
    if (!h.text.endsWith('?')) continue;
    const words = h.text.split(' ').filter((w) => /^[a-z]/i.test(w));
    const capitalised = words.slice(1).filter((w) => /^[A-Z][a-z]{2,}/.test(w));
    if (capitalised.length >= 3) {
      issues.push({
        ruleId: 'CASE-05',
        category: 'Formatting',
        severity: 'warn',
        items: ['F1'],
        title: 'Question heading looks Title Cased',
        where: h.tag.toUpperCase(),
        found: h.text,
        expected: 'Sentence case, e.g. “How is rising R&D investment driving growth?”',
        fix: 'Question-style H2s on other reports are sentence case. Lowercase the mid-sentence words.',
      });
    }
  }

  // ── CASE-06 · trailing colon consistency across sibling headings ────────────
  // Baseline: 3124 “Key Market Highlights”, 3129 “Key Market Highlights:”.
  const colonised = doc.headings.filter((h) => h.level >= 3 && h.trailingColon);
  const bare = doc.headings.filter((h) => h.level >= 3 && !h.trailingColon && !h.text.endsWith('?'));
  if (colonised.length && bare.length) {
    issues.push({
      ruleId: 'CASE-06',
      category: 'Formatting',
      severity: 'fail',
      items: ['F5'],
      title: 'Mixed trailing colons on sub-headings',
      where: 'H3 group',
      found: `With colon: ${colonised.map((h) => `“${h.text}”`).join(', ')} — without: ${bare.slice(0, 4).map((h) => `“${h.text}”`).join(', ')}`,
      expected: 'No trailing colon on any sub-heading',
      fix: `Drop the colon from ${colonised.map((h) => `“${h.text}”`).join(', ')}.`,
    });
  }

  // ── CASE-07 · “Key Insight” capitalisation (template B) ─────────────────────
  const insightVariants = Array.from(doc.text.matchAll(/Key\s+(Insight|insight)\s*:/g)).map((m) => m[0]);
  const distinct = Array.from(new Set(insightVariants));
  if (distinct.length > 1) {
    issues.push({
      ruleId: 'CASE-07',
      category: 'Formatting',
      severity: 'fail',
      items: ['F5'],
      title: 'Callout label is capitalised inconsistently on the same page',
      where: 'Key Insight callouts',
      found: distinct.join('  vs  '),
      expected: 'Key Insight:',
      fix: 'Use “Key Insight:” in every callout on the page.',
    });
  }

  // ── CASE-08 · U.S. style ────────────────────────────────────────────────────
  const usIssues = [];
  if (/\bUS\b(?!\s*[$€])/.test(doc.text) && /U\.S\./.test(doc.text)) {
    usIssues.push('both “US” and “U.S.” appear');
  }
  const noSpaceAfterUS = doc.text.match(/U\.S\.[a-z]/);
  if (noSpaceAfterUS) usIssues.push(`missing space after “U.S.” in “${noSpaceAfterUS[0]}”`);
  // No \b after "U.S." — a word boundary cannot exist between "." and "?" or
  // end-of-string, so the earlier form silently never matched "…in U.S.?".
  const inUS = doc.text.match(/\bin\s+U\.S\.(?![A-Za-z])(?!\s*(?:market|industry|and|,))/i);
  if (inUS) usIssues.push('“in U.S.” should read “in the U.S.”');
  if (usIssues.length) {
    issues.push({
      ruleId: 'CASE-08',
      category: 'Formatting',
      severity: 'fail',
      items: ['F6', 'M12'],
      title: 'Country abbreviation style is off',
      where: 'Body copy',
      found: usIssues.join('; '),
      expected: '“U.S.” with periods, a space after it, and “the U.S.” when used as a noun',
      fix: 'Normalise every instance to “U.S.” and add the missing article/space.',
    });
  }

  // ── CASE-09 · sentence-initial lowercase in list items ──────────────────────
  doc.paragraphs
    .filter((p) => p.tag === 'li')
    .forEach((p) => {
      const first = p.text.trim()[0];
      if (first && /[a-z]/.test(first) && p.text.length > 40) {
        issues.push({
          ruleId: 'CASE-09',
          category: 'Formatting',
          severity: 'warn',
          items: ['F1'],
          title: 'List item starts lowercase',
          where: 'Bullet list',
          found: context(doc.text, p.text.slice(0, 60), 0),
          expected: 'Capital first letter',
          fix: `Capitalise the first word of “${p.text.slice(0, 60)}…”.`,
        });
      }
    });

  return issues;
}
