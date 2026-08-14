import { norm, unique } from '../util.js';

/**
 * Font, size and mobile typography.
 *
 * The first version of this file was wrong in an instructive way: it flagged the
 * *presence* of an inline font-size rather than checking its *value*. If the
 * house body size is 12pt and the page says 12pt, that is a pass, not a defect.
 * The question is never "is there a size here", it is "is it the right size".
 *
 * Set the expected size with BODY_FONT_SIZE (default 12pt). Units are normalised
 * before comparison, so 12pt, 16px and 1rem all count as the same size.
 */

const DEFAULT_BODY_SIZE = '12pt';
const HEADING_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

/** Everything to px, so 12pt, 16px and 1rem compare equal. */
export function toPx(raw) {
  const m = String(raw).trim().match(/^([\d.]+)\s*(px|pt|rem|em|%)?$/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return null;
  const unit = (m[2] || 'px').toLowerCase();
  if (unit === 'px') return n;
  if (unit === 'pt') return (n * 4) / 3;
  if (unit === 'rem' || unit === 'em') return n * 16;
  if (unit === '%') return (n / 100) * 16;
  return null;
}

/** Contents of every @media block, with its condition. Brace-matched, not regexed. */
export function mediaBlocks(css = '') {
  const out = [];
  const text = String(css);
  let i = 0;
  while ((i = text.indexOf('@media', i)) !== -1) {
    const open = text.indexOf('{', i);
    if (open === -1) break;
    const condition = norm(text.slice(i + 6, open));
    let depth = 1;
    let j = open + 1;
    while (j < text.length && depth > 0) {
      if (text[j] === '{') depth += 1;
      else if (text[j] === '}') depth -= 1;
      j += 1;
    }
    out.push({ condition, body: text.slice(open + 1, j - 1) });
    i = j;
    if (out.length > 300) break;
  }
  return out;
}

/** Font sizes declared inside phone-width media queries. */
export function mobileFontScale(css = '') {
  const sizes = [];
  for (const block of mediaBlocks(css)) {
    const width = block.condition.match(/max-width\s*:\s*(\d+)/i);
    if (!width || Number(width[1]) > 820) continue;
    for (const m of block.body.matchAll(/font-size\s*:\s*([^;}]+)/gi)) {
      const value = norm(m[1]);
      if (/var\(|inherit|initial/i.test(value)) continue;
      sizes.push({ breakpoint: `${width[1]}px`, value, px: toPx(value) });
    }
  }
  return sizes;
}

export default function typographyRules(doc) {
  const issues = [];

  const expectedRaw = process.env.BODY_FONT_SIZE || DEFAULT_BODY_SIZE;
  const expectedPx = toPx(expectedRaw);

  // Inline font-size on body copy only. Headings are legitimately a different
  // size and are not measured against the body scale.
  const bodySized = (doc.inlineStyles || [])
    .filter((s) => !HEADING_TAGS.has(String(s.tag).toLowerCase()))
    .map((s) => ({ ...s, size: (s.style.match(/font-size\s*:\s*([^;]+)/i) || [])[1] }))
    .filter((s) => s.size)
    .map((s) => ({ ...s, size: norm(s.size), px: toPx(s.size) }));

  // ── TYPO-01 · body font size must be the house size ─────────────────────────
  if (bodySized.length && expectedPx != null) {
    const wrong = bodySized.filter((s) => s.px == null || Math.abs(s.px - expectedPx) > 0.5);
    const right = bodySized.length - wrong.length;

    if (wrong.length) {
      const grouped = {};
      for (const w of wrong) (grouped[w.size] ||= []).push(w);
      issues.push({
        ruleId: 'TYPO-01',
        category: 'Formatting',
        severity: 'fail',
        items: ['F16'],
        title: `Body copy set at the wrong size (${wrong.length} element${wrong.length === 1 ? '' : 's'})`,
        where: unique(wrong.map((w) => String(w.tag).toUpperCase())).join(', '),
        found: Object.entries(grouped)
          .map(([size, els]) => `${size} × ${els.length} — first: “${els[0].text}”`)
          .join('\n'),
        expected: `${expectedRaw} (${expectedPx.toFixed(0)}px)`,
        fix: `Reset these to ${expectedRaw}.${
          right
            ? ` The other ${right} element${right === 1 ? ' is' : 's are'} already correct, so this is a partial override rather than a global setting.`
            : ''
        }`,
      });
    } else {
      issues.push({
        ruleId: 'TYPO-01',
        category: 'Formatting',
        severity: 'info',
        items: [],
        title: `Body font size is ${expectedRaw} throughout (${bodySized.length} elements)`,
        where: 'Body copy',
        found: `all ${bodySized.length} inline sizes match ${expectedRaw}`,
        expected: '',
        fix: '',
      });
    }
  }

  // ── TYPO-02 · font family ───────────────────────────────────────────────────
  const families = (doc.inlineStyles || [])
    .map((s) => (s.style.match(/font-family\s*:\s*([^;]+)/i) || [])[1])
    .filter(Boolean)
    .map((f) => norm(f).replace(/['"]/g, '').toLowerCase());
  const expectedFamily = (process.env.BODY_FONT_FAMILY || '').toLowerCase().trim();
  const distinctFamilies = unique(families);

  if (expectedFamily && distinctFamilies.length) {
    const offFamily = distinctFamilies.filter((f) => !f.startsWith(expectedFamily));
    if (offFamily.length) {
      issues.push({
        ruleId: 'TYPO-02',
        category: 'Formatting',
        severity: 'fail',
        items: ['F16'],
        title: 'Body copy uses a font family other than the house face',
        where: 'Inline styles',
        found: offFamily.join(' · '),
        expected: process.env.BODY_FONT_FAMILY,
        fix: 'Almost always a paste from Word or Docs carrying Calibri or Times through. Strip the inline family.',
      });
    }
  } else if (distinctFamilies.length > 1) {
    issues.push({
      ruleId: 'TYPO-02',
      category: 'Formatting',
      severity: 'warn',
      items: ['F16'],
      title: `Body copy mixes ${distinctFamilies.length} font families`,
      where: 'Inline styles',
      found: distinctFamilies.slice(0, 4).join(' · '),
      expected: 'One family throughout',
      fix: 'Set BODY_FONT_FAMILY in the environment to turn this into a hard check against your house face.',
    });
  }

  // ── TYPO-03 · legacy presentational tags ────────────────────────────────────
  if ((doc.fontTags || []).length) {
    issues.push({
      ruleId: 'TYPO-03',
      category: 'Formatting',
      severity: 'fail',
      items: ['F16'],
      title: 'Deprecated presentational tags in the content',
      where: unique(doc.fontTags.map((t) => `<${t.tag}>`)).join(', '),
      found: doc.fontTags.slice(0, 3).map((t) => `<${t.tag}> “${t.text}”`).join('\n'),
      expected: 'Semantic markup only',
      fix: 'Replace <font>, <big>, <small> and <center> with ordinary paragraphs. These were removed from the standard and render inconsistently.',
    });
  }

  // ── TYPO-04 · paste-artifact class names ────────────────────────────────────
  if ((doc.classedSpans || []).length) {
    issues.push({
      ruleId: 'TYPO-04',
      category: 'Formatting',
      severity: 'warn',
      items: ['F16'],
      title: 'Class names left behind by a word-processor paste',
      where: `${doc.classedSpans.length} element(s)`,
      found: unique(doc.classedSpans.map((s) => s.cls)).slice(0, 4).join(' · '),
      expected: 'No editor-generated classes',
      fix: 'Classes like MsoNormal or c12 come from Word and Google Docs. Inert today, but they collide the moment someone adds a rule with the same name.',
    });
  }

  // ── TYPO-06 · inline sizes cannot respond at mobile widths ──────────────────
  // The concrete answer to "mobile size may vary for font". An inline style beats
  // any stylesheet rule, media query included. If the CSS shrinks body text at a
  // phone breakpoint and the copy carries an inline size, phone readers keep the
  // desktop size — the one place it hurts most.
  const scale = mobileFontScale(doc.css);
  if (bodySized.length && scale.length && expectedPx != null) {
    const shrinks = scale.filter((s) => s.px != null && Math.abs(s.px - expectedPx) > 0.5);
    if (shrinks.length) {
      issues.push({
        ruleId: 'TYPO-06',
        category: 'Technical',
        severity: 'fail',
        items: ['M23', 'F16'],
        title: 'Inline font sizes will not respond at mobile widths',
        where: `${bodySized.length} element(s) carry an inline size`,
        found: `stylesheet sets ${unique(shrinks.map((s) => `${s.value} at ${s.breakpoint}`)).slice(0, 3).join(', ')}, and inline sizes override it`,
        expected: 'No inline size, so the mobile rule applies',
        fix: 'An inline style beats a media query. Remove the inline sizes and let the stylesheet own the mobile scale, otherwise phone readers get the desktop size.',
      });
    }
  }

  if (scale.length) {
    issues.push({
      ruleId: 'TYPO-07',
      category: 'Technical',
      severity: 'info',
      items: [],
      title: 'Mobile font scale declared by the stylesheet',
      where: 'Media queries under 820px',
      found: unique(scale.map((s) => `${s.value} @ max-width ${s.breakpoint}`)).slice(0, 8).join(' · '),
      expected: '',
      fix: '',
    });
  } else if (doc.css) {
    issues.push({
      ruleId: 'TYPO-07',
      category: 'Technical',
      severity: 'warn',
      items: ['M23'],
      title: 'No mobile font size declared anywhere in the stylesheet',
      where: 'Media queries under 820px',
      found: 'no font-size rule inside a phone-width media query',
      expected: 'A declared mobile type scale',
      fix: 'Body text renders at the desktop size on a phone. Fine if that is deliberate and the size is readable at 375px; worth confirming with engineering if not.',
    });
  }

  return issues;
}
