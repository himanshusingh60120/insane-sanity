import { norm, unique } from '../util.js';

/**
 * Font and size checks.
 *
 * What this can and cannot do, stated plainly because it changes how you should
 * read a "Yes" on F16:
 *
 * CAN detect, with certainty, from the HTML:
 *   - inline style attributes setting font-size / font-family / colour on body
 *     content — the fingerprint of a paste from Word or Google Docs
 *   - legacy presentational tags (<font>, <big>, <small>, <center>)
 *   - paste-artifact class names (MsoNormal, c12, s3, western…)
 *   - font-size and font-family declarations in the site stylesheet, listed so
 *     you can see the intended scale
 *
 * CANNOT detect without a real browser:
 *   - the *computed* pixel size of a given paragraph as rendered
 *
 * Computed style needs a layout engine — Playwright or Puppeteer — which does
 * not run inside a Vercel serverless function without a custom Chromium layer.
 * That is a real gap, and the honest framing is this: the site stylesheet is
 * shared by every report and is therefore consistent by construction, so the
 * per-report typography risk is almost entirely "an editor pasted styled text
 * into the CMS". That is exactly what the rules below catch.
 */
export default function typographyRules(doc) {
  const issues = [];

  // ── TYPO-01 · inline font styling on body content ───────────────────────────
  const fontish = (doc.inlineStyles || []).filter((s) => /font-size|font-family|font-weight/i.test(s.style));
  if (fontish.length) {
    const sizes = unique(
      fontish.map((s) => (s.style.match(/font-size\s*:\s*([^;]+)/i) || [])[1]).filter(Boolean).map(norm)
    );
    const families = unique(
      fontish.map((s) => (s.style.match(/font-family\s*:\s*([^;]+)/i) || [])[1]).filter(Boolean).map(norm)
    );
    issues.push({
      ruleId: 'TYPO-01',
      category: 'Formatting',
      severity: 'fail',
      items: ['F16'],
      title: `Body copy carries inline font styling (${fontish.length} element${fontish.length === 1 ? '' : 's'})`,
      where: unique(fontish.map((s) => s.tag.toUpperCase())).join(', '),
      found: [
        sizes.length ? `sizes: ${sizes.join(' · ')}` : '',
        families.length ? `families: ${families.join(' · ')}` : '',
        `first: “${fontish[0].text}”`,
      ]
        .filter(Boolean)
        .join('\n'),
      expected: 'No inline font styling — the stylesheet owns typography',
      fix: 'Strip the inline styles in the CMS. Paste as plain text, or use the “remove formatting” control, then re-apply bold and italics with the editor. Hard-coded sizes will not follow the site scale and will not respond on mobile.',
    });
  }

  // ── TYPO-02 · colour and background overrides ───────────────────────────────
  const coloured = (doc.inlineStyles || []).filter((s) => /(^|;)\s*(color|background)/i.test(s.style));
  if (coloured.length) {
    issues.push({
      ruleId: 'TYPO-02',
      category: 'Formatting',
      severity: 'warn',
      items: ['F16'],
      title: `Inline colour or background on body copy (${coloured.length})`,
      where: unique(coloured.map((s) => s.tag.toUpperCase())).join(', '),
      found: coloured.slice(0, 3).map((s) => `${s.tag}: ${s.style}`).join('\n'),
      expected: 'Inherited colour from the stylesheet',
      fix: 'Usually a leftover highlight or a pasted link colour. Remove it — hard-coded colours can fail contrast and will not adapt if the palette changes.',
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
      fix: 'Replace <font>, <big>, <small> and <center> with ordinary paragraphs. These were removed from the HTML standard and render inconsistently.',
    });
  }

  // ── TYPO-04 · paste-artifact class names ────────────────────────────────────
  if ((doc.classedSpans || []).length) {
    const classes = unique(doc.classedSpans.map((s) => s.cls));
    issues.push({
      ruleId: 'TYPO-04',
      category: 'Formatting',
      severity: 'warn',
      items: ['F16'],
      title: 'Class names left behind by a word-processor paste',
      where: `${doc.classedSpans.length} element(s)`,
      found: classes.slice(0, 4).join(' · '),
      expected: 'No editor-generated classes',
      fix: 'Classes like MsoNormal or c12 come from Word and Google Docs. They are inert today but will collide the moment someone adds a rule with the same name. Re-paste the affected block as plain text.',
    });
  }

  // ── TYPO-05 · stylesheet font inventory ─────────────────────────────────────
  // Informational, not a pass/fail. It tells you what scale the template
  // actually declares, which is the thing to compare across reports.
  const sizes = unique(
    Array.from(String(doc.css || '').matchAll(/font-size\s*:\s*([^;}]+)/gi)).map((m) => norm(m[1]))
  ).filter((s) => !/var\(|inherit|initial/i.test(s));
  const families = unique(
    Array.from(String(doc.css || '').matchAll(/font-family\s*:\s*([^;}]+)/gi)).map((m) => norm(m[1]))
  ).filter((f) => !/var\(|inherit|initial/i.test(f));

  if (sizes.length || families.length) {
    issues.push({
      ruleId: 'TYPO-05',
      category: 'Formatting',
      severity: 'info',
      items: [],
      title: 'Typography declared by the site stylesheet',
      where: 'Linked CSS',
      found: [
        families.length ? `families (${families.length}): ${families.slice(0, 4).join(' · ')}` : '',
        sizes.length ? `sizes (${sizes.length}): ${sizes.slice(0, 12).join(' · ')}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
      expected: '',
      fix: '',
    });
  }

  return issues;
}
