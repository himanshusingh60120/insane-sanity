import { reveal, context, unique, norm } from '../util.js';

const BANNED_TONE = [
  'game-changing', 'revolutionary', 'cutting-edge', 'world-class', 'best-in-class',
  'unprecedented', 'skyrocket', 'explode', 'staggering', 'mind-blowing', 'seamlessly',
  'delve into', 'in today\'s world', 'it is important to note',
];

export default function technicalRules(doc, ctx = {}) {
  const issues = [];
  const text = doc.text;
  const raw = doc.rawText;

  // ── TECH-01 · HTTP status ───────────────────────────────────────────────────
  if (doc.status !== 200) {
    issues.push({
      ruleId: 'TECH-01',
      category: 'Technical',
      severity: 'fail',
      items: ['M22', 'M24'],
      title: `Page returned HTTP ${doc.status}`,
      where: 'Response',
      found: String(doc.status),
      expected: '200',
      fix: 'The page is not serving correctly. Nothing below this line is reliable.',
    });
  }

  // ── TECH-02 · present in the reports sitemap ────────────────────────────────
  if (ctx.sitemapUrls && ctx.sitemapUrls.length) {
    const inSitemap = ctx.sitemapUrls.some((u) => u.replace(/\/+$/, '') === doc.url.replace(/\/+$/, ''));
    if (!inSitemap) {
      issues.push({
        ruleId: 'TECH-02',
        category: 'Technical',
        severity: 'fail',
        items: ['M24'],
        title: 'URL is not listed in sitemap-reports.xml',
        where: 'Sitemap',
        found: 'absent',
        expected: 'Listed in the reports sitemap',
        fix: 'Regenerate the sitemap. Until it lists this URL, discovery relies on internal links alone.',
      });
    }
  }

  // ── TECH-03 · language attribute ────────────────────────────────────────────
  if (!doc.lang) {
    issues.push({
      ruleId: 'TECH-03',
      category: 'Technical',
      severity: 'warn',
      items: ['M22'],
      title: '<html> has no lang attribute',
      where: '<html>',
      found: '(none)',
      expected: 'lang="en"',
      fix: 'Add lang="en".',
    });
  }

  // ── TECH-04 · fixed pixel widths that break mobile ──────────────────────────
  const fixedWidths = unique(
    Array.from(doc.html.matchAll(/style=["'][^"']*width\s*:\s*(\d{3,})px/gi)).map((m) => `${m[1]}px`)
  ).filter((w) => parseInt(w, 10) > 380);
  if (fixedWidths.length) {
    issues.push({
      ruleId: 'TECH-04',
      category: 'Technical',
      severity: 'fail',
      items: ['M23'],
      title: 'Inline fixed pixel widths wider than a phone screen',
      where: 'Inline styles',
      found: fixedWidths.slice(0, 5).join(', '),
      expected: 'Percentage or max-width values',
      fix: 'These force horizontal scrolling on mobile. Replace with max-width: 100%.',
    });
  }

  // ── TECH-05 · tables need a scroll container on mobile ──────────────────────
  const wideTables = doc.tables.filter((t) => t.headerCells.length >= 3 || t.rows.some((r) => r.length >= 3));
  if (wideTables.length) {
    const wrapped = /overflow-x\s*:\s*auto|overflow\s*:\s*auto|table-wrap|overflow-auto/i.test(doc.html);
    if (!wrapped) {
      issues.push({
        ruleId: 'TECH-05',
        category: 'Technical',
        severity: 'warn',
        items: ['M23'],
        title: 'Wide table has no horizontal scroll container',
        where: `${wideTables.length} table(s)`,
        found: 'no overflow-x wrapper detected',
        expected: 'Table wrapped in a scrollable div',
        fix: 'Wrap wide tables so they scroll instead of overflowing on mobile.',
      });
    }
  }

  // ── TECH-06 · double spaces in copy ─────────────────────────────────────────
  // Scans the raw subtitle separately from the body. Headings are normalised
  // during parsing, so a run of spaces inside the subtitle would otherwise be
  // collapsed before it reached this rule — and the subtitle is where the
  // recurring "Analysis,  2026 - 2033" defect lives.
  const haystacks = [
    ['Body copy', raw],
    ['H2 · subtitle', doc.subtitleRaw || ''],
  ];
  const doubles = [];
  for (const [label, value] of haystacks) {
    for (const hit of String(value).matchAll(/\S {2,6}\S/g)) {
      doubles.push({ label, snippet: reveal(context(String(value), hit[0], 28)) });
      if (doubles.length >= 6) break;
    }
  }
  if (doubles.length) {
    const places = unique(doubles.map((d) => d.label));
    issues.push({
      ruleId: 'TECH-06',
      category: 'Formatting',
      severity: 'fail',
      items: ['F12', 'M11'],
      title: `Double spaces in the copy (${doubles.length} instance${doubles.length === 1 ? '' : 's'})`,
      where: places.join(' · '),
      found: doubles.slice(0, 3).map((d) => `${d.label}: ${d.snippet}`).join('\n'),
      expected: 'Single spaces',
      fix: 'Find-and-replace two spaces with one. The subtitle line “Analysis,  2026 - 2033” is the usual culprit and it appears on every report I compared.',
    });
  }

  // ── TECH-07 · mixed straight and curly quotes ───────────────────────────────
  const curly = /[\u2018\u2019\u201c\u201d]/.test(raw);
  const straight = /["']/.test(raw.replace(/<[^>]*>/g, ''));
  if (curly && straight) {
    const straightHit = raw.replace(/<[^>]*>/g, '').match(/[^\s]["'][^\s]?/);
    issues.push({
      ruleId: 'TECH-07',
      category: 'Formatting',
      severity: 'warn',
      items: ['F12'],
      title: 'Straight and curly quotation marks both used',
      where: 'Body copy',
      found: straightHit ? context(text, straightHit[0], 30) : 'mixed',
      expected: 'Curly quotes throughout',
      fix: 'Normalise to typographic quotes.',
    });
  }

  // ── TECH-08 · space before punctuation, repeated words ──────────────────────
  const spaceBefore = text.match(/\s+[,.;:](?=\s|$)/);
  if (spaceBefore) {
    issues.push({
      ruleId: 'TECH-08',
      category: 'Grammar',
      severity: 'fail',
      items: ['M12'],
      title: 'Space before punctuation',
      where: 'Body copy',
      found: reveal(context(text, spaceBefore[0], 30)),
      expected: 'No space before a comma or full stop',
      fix: 'Remove the space.',
    });
  }
  const repeated = text.match(/\b(\w{3,})\s+\1\b/i);
  if (repeated) {
    issues.push({
      ruleId: 'TECH-08',
      category: 'Grammar',
      severity: 'fail',
      items: ['M11', 'M12'],
      title: 'Repeated word',
      where: 'Body copy',
      found: context(text, repeated[0], 35),
      expected: repeated[1],
      fix: `Delete the duplicate “${repeated[1]}”.`,
    });
  }
  const missingSpace = text.match(/[a-z]{2}\.[A-Za-z]{2}/);
  if (missingSpace && !/\.(com|org|net|gov|io|co)\b/i.test(missingSpace[0])) {
    issues.push({
      ruleId: 'TECH-08',
      category: 'Grammar',
      severity: 'fail',
      items: ['M11'],
      title: 'Missing space after a full stop',
      where: 'Body copy',
      found: context(text, missingSpace[0], 35),
      expected: 'Space after the sentence break',
      fix: 'Insert the missing space.',
    });
  }

  // ── TECH-09 · placeholder text left behind ──────────────────────────────────
  const placeholders = ['lorem ipsum', 'xxx', 'tbd', 'todo', 'placeholder', '[insert', 'sample text'];
  const found = placeholders.filter((p) => text.toLowerCase().includes(p));
  if (found.length) {
    issues.push({
      ruleId: 'TECH-09',
      category: 'Content Accuracy',
      severity: 'fail',
      items: ['M11', 'M13'],
      title: 'Placeholder text is still on the page',
      where: 'Body copy',
      found: found.join(', '),
      expected: 'Final copy',
      fix: 'Replace the placeholder before publishing.',
    });
  }

  // ── TECH-10 · tone ──────────────────────────────────────────────────────────
  const toneHits = BANNED_TONE.filter((w) => text.toLowerCase().includes(w));
  if (toneHits.length) {
    issues.push({
      ruleId: 'TECH-10',
      category: 'Grammar',
      severity: 'warn',
      items: ['M13'],
      title: 'Marketing filler in an analyst report',
      where: 'Body copy',
      found: toneHits.join(', '),
      expected: 'Neutral analytical register',
      fix: `Cut ${toneHits.map((t) => `“${t}”`).join(', ')} and state the finding plainly.`,
    });
  }
  const exclamations = (text.match(/!/g) || []).length;
  if (exclamations > 0) {
    issues.push({
      ruleId: 'TECH-10',
      category: 'Grammar',
      severity: 'warn',
      items: ['M13'],
      title: 'Exclamation marks in report copy',
      where: 'Body copy',
      found: `${exclamations} instance(s)`,
      expected: 'None',
      fix: 'Remove them.',
    });
  }
  const firstPerson = text.match(/\b(we|our|us)\b/i);
  if (firstPerson && !/our (?:blogs?|newsletter|research process)/i.test(text)) {
    issues.push({
      ruleId: 'TECH-10',
      category: 'Grammar',
      severity: 'warn',
      items: ['M13'],
      title: 'First-person voice in report copy',
      where: 'Body copy',
      found: context(text, firstPerson[0], 35),
      expected: 'Third person throughout',
      fix: 'Rewrite in the third person, except in the FAQ where “you” is house style.',
    });
  }

  // ── TECH-11 · author and reviewer attribution ───────────────────────────────
  if (!doc.metaBar.author) {
    issues.push({
      ruleId: 'TECH-11',
      category: 'Structure',
      severity: 'fail',
      items: ['F14'],
      title: 'No author in the meta bar',
      where: 'Meta bar',
      found: '(none)',
      expected: 'Author: [name]',
      fix: 'Attribute the report.',
    });
  }
  if (!doc.metaBar.reviewedBy) {
    issues.push({
      ruleId: 'TECH-11',
      category: 'Structure',
      severity: 'warn',
      items: ['F14'],
      title: 'No “Reviewed By” in the meta bar',
      where: 'Meta bar',
      found: '(none)',
      expected: 'Reviewed By: [name]',
      fix: 'The newer reports carry a reviewer line in the meta bar; the older ones only credit the reviewer at the foot of the page. Add it here for consistency.',
    });
  }
  if (!doc.metaBar.lastUpdated) {
    issues.push({
      ruleId: 'TECH-11',
      category: 'Structure',
      severity: 'warn',
      items: ['M24'],
      title: 'No “Last Updated” date',
      where: 'Meta bar',
      found: '(none)',
      expected: 'Last Updated: [Month Year]',
      fix: 'Add the update date.',
    });
  }

  // ── TECH-12 · release date is not in the future ─────────────────────────────
  const release = doc.metaBar.release || doc.metaBar.lastUpdated;
  if (release) {
    const parsed = Date.parse(`1 ${release}`);
    if (Number.isFinite(parsed) && parsed > Date.now() + 45 * 864e5) {
      issues.push({
        ruleId: 'TECH-12',
        category: 'Content Accuracy',
        severity: 'fail',
        items: ['M09'],
        title: 'Release date is in the future',
        where: 'Meta bar',
        found: release,
        expected: 'Current or past month',
        fix: 'Correct the release date.',
      });
    }
  }

  // ── TECH-13 · word count floor ──────────────────────────────────────────────
  if (doc.wordCount < 700 && doc.pageType === 'report') {
    issues.push({
      ruleId: 'TECH-13',
      category: 'Structure',
      severity: 'fail',
      items: ['M15'],
      title: 'Description is unusually short for a report page',
      where: 'Body copy',
      found: `${doc.wordCount} words`,
      expected: '1,200+ words',
      fix: 'Check the content rendered fully — comparable reports run well over a thousand words.',
    });
  }

  // ── TECH-14 · TTFB ──────────────────────────────────────────────────────────
  if (doc.ttfbMs > 4000) {
    issues.push({
      ruleId: 'TECH-14',
      category: 'Technical',
      severity: 'warn',
      items: ['M22'],
      title: 'Slow response',
      where: 'Response',
      found: `${doc.ttfbMs} ms to first byte`,
      expected: 'Under 2,000 ms',
      fix: 'Worth flagging to engineering if it repeats.',
    });
  }

  return issues;
}
