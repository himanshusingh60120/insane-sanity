import * as cheerio from 'cheerio';
import { norm, slugify } from './util.js';

const CHROME_SELECTORS = 'header, nav, footer, script, style, noscript, svg, form, aside';

/**
 * Minimal entity decode. &nbsp; is deliberately decoded to U+00A0 and left
 * there — see the note on doc.textSegments below.
 */
function decodeEntities(s = '') {
  return String(s)
    .replace(/&nbsp;/gi, '\u00a0')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&#8217;/g, '\u2019')
    .replace(/&#8220;/g, '\u201c')
    .replace(/&#8221;/g, '\u201d');
}

/**
 * Finds the editorial body of the page. Everything outside it (nav, sticky bar,
 * footer) is site chrome shared by every report and must not be flagged as a
 * per-report editorial defect.
 */
function pickContentRoot($) {
  const anchors = [];
  $('h2, h3').each((_, el) => {
    const t = norm($(el).text()).toLowerCase();
    if (/^market definition$|^market overview$|market report snapshot$|^market segmentation$|^competitive landscape$/.test(t)) {
      anchors.push($(el));
    }
  });
  if (anchors.length) {
    // Walk up until one container holds every anchor heading.
    let node = anchors[0].parent();
    for (let i = 0; i < 8 && node.length; i += 1) {
      const holds = anchors.every((a) => node.find(a).length > 0 || node.is(a.parent()));
      if (holds && node.find('h2').length >= Math.min(3, anchors.length)) return node;
      node = node.parent();
    }
  }
  const main = $('main');
  if (main.length) return main.first();
  return $('body');
}

/** Selectors in the site CSS that force upper-case, so we can tell CSS caps from source caps. */
function uppercasingSelectors(css = '') {
  const out = [];
  const blocks = css.match(/[^{}]+\{[^{}]*\}/g) || [];
  for (const block of blocks) {
    const [selectorPart, bodyPart] = block.split('{');
    if (!/text-transform\s*:\s*uppercase/i.test(bodyPart)) continue;
    selectorPart
      .split(',')
      .map((s) => norm(s))
      .filter((s) => s && !s.startsWith('@') && !/[:][:]?(before|after|hover|focus|active|root)/i.test(s))
      .forEach((s) => out.push(s));
  }
  return Array.from(new Set(out)).slice(0, 150);
}

const META_BAR_FIELDS = [
  ['pages', /^Pages\s*:?\s*(.+)$/i],
  ['baseYear', /^Base Year\s*:?\s*(.+)$/i],
  ['release', /^Release\s*:?\s*(.+)$/i],
  ['author', /^Author\s*:?\s*(.+)$/i],
  ['reviewedBy', /^Reviewed By\s*:?\s*(.+)$/i],
  ['lastUpdated', /^Last Updated\s*:?\s*(.+)$/i],
];

/**
 * One traversal for all six fields. The previous version walked the whole
 * document once per field and called .text() on every element, which serialises
 * the subtree each time — quadratic, and the first thing to bite on a long page.
 */
function readMetaBar($) {
  const out = { pages: '', baseYear: '', release: '', author: '', reviewedBy: '', lastUpdated: '' };
  let remaining = META_BAR_FIELDS.length;
  const candidates = $('body').find('span, div, li, p, td, th, strong, b, small').slice(0, 4000);

  candidates.each((_, el) => {
    if (!remaining) return false;
    const $el = $(el);
    if ($el.children().length > 2) return undefined;
    const t = norm($el.text());
    if (!t || t.length > 90) return undefined;
    for (const [key, re] of META_BAR_FIELDS) {
      if (out[key]) continue;
      const m = t.match(re);
      if (m && m[1].length < 80) {
        out[key] = norm(m[1]);
        remaining -= 1;
      }
    }
    return undefined;
  });

  return out;
}

export function parsePage({ url, html, css = '', status = 200, ttfbMs = 0 }) {
  const $ = cheerio.load(html);
  const $root = pickContentRoot($);

  const meta = {};
  $('meta').each((_, el) => {
    const key = $(el).attr('name') || $(el).attr('property') || '';
    if (key) meta[key.toLowerCase()] = $(el).attr('content') || '';
  });

  const doc = {
    url,
    status,
    ttfbMs,
    html,
    css,
    $,
    $root,
    title: norm($('title').first().text()),
    canonical: $('link[rel="canonical"]').attr('href') || '',
    meta,
    lang: $('html').attr('lang') || '',
    jsonLd: [],
  };

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      doc.jsonLd.push(JSON.parse($(el).contents().text()));
    } catch {
      doc.jsonLd.push({ __parseError: true });
    }
  });

  // ── URL parts ───────────────────────────────────────────────────────────────
  const path = new URL(url).pathname;
  doc.path = path;
  doc.pageType = path.startsWith('/report/')
    ? 'report'
    : path.startsWith('/blog/')
    ? 'blog'
    : path.startsWith('/press-release/')
    ? 'press-release'
    : 'other';
  doc.slug = path.split('/').filter(Boolean).pop() || '';
  const idMatch = doc.slug.match(/-(\d+)$/);
  doc.reportId = idMatch ? idMatch[1] : '';
  doc.slugBody = idMatch ? doc.slug.slice(0, -(idMatch[0].length)) : doc.slug;

  // ── Headings ────────────────────────────────────────────────────────────────
  // Resolve each uppercasing selector once and remember which nodes it hit.
  // Testing every heading against every selector was O(headings × selectors) —
  // on a real page that is tens of thousands of selector parses.
  const uppercaseHits = new Map();
  for (const sel of uppercasingSelectors(css)) {
    try {
      $(sel).each((_, node) => {
        if (!uppercaseHits.has(node)) uppercaseHits.set(node, sel);
      });
    } catch {
      /* unsupported selector — ignore */
    }
  }
  const matchesUppercaseCss = (el) => {
    if (uppercaseHits.has(el)) return uppercaseHits.get(el);
    const inline = $(el).attr('style') || '';
    if (/text-transform\s*:\s*uppercase/i.test(inline)) return 'inline style';
    return null;
  };

  // The descriptive line under the H1 is an H2 in the markup but it is a
  // sentence, not a Title Case heading. Segment labels inside it ("By Type",
  // "By End User") are house style, so Title Case rules must skip it or they
  // fire on every report ever published.
  const subtitleEl = $('h1').first().nextAll('h2').first().get(0);

  doc.headings = [];
  $root.find('h1, h2, h3, h4, h5, h6').each((_, el) => {
    const $el = $(el);
    const text = norm($el.text());
    if (!text) return;
    doc.headings.push({
      level: Number(el.tagName.replace('h', '')),
      text,
      html: norm($el.html() || ''),
      boldWrapped: /^<(strong|b)>/i.test(($el.html() || '').trim()),
      trailingColon: /:$/.test(text),
      cssUppercase: matchesUppercaseCss(el),
      isSubtitle: el === subtitleEl,
      tag: el.tagName,
    });
  });

  doc.h1 = norm($('h1').first().text());
  // The long descriptive line directly under the H1. Kept twice: normalised for
  // matching, and raw so that whitespace defects survive. Every heading in
  // doc.headings is normalised, so without this copy the double space in
  // "…and Regional Analysis,  2026 - 2033" would be collapsed before any rule
  // could see it.
  const $subtitle = $('h1').first().nextAll('h2').first();
  doc.subtitleRaw = ($subtitle.length ? $subtitle.text() : $('h2').first().text()).replace(/\u00a0/g, ' ');
  doc.subtitle = norm(doc.subtitleRaw);

  // ── Meta bar (Pages / Base Year / Release / Author / Reviewed By) ───────────
  doc.metaBar = readMetaBar($);

  // ── Tables ──────────────────────────────────────────────────────────────────
  doc.tables = [];
  $root.find('table').each((_, el) => {
    const $t = $(el);
    const headerCells = [];
    $t.find('tr').first().find('th, td').each((__, cell) => headerCells.push(norm($(cell).text())));
    const rows = [];
    $t.find('tr').slice(1).each((__, tr) => {
      const cells = [];
      $(tr).find('td, th').each((___, cell) => cells.push(norm($(cell).text())));
      if (cells.length) rows.push(cells);
    });
    doc.tables.push({ headerCells, rows, hasThead: $t.find('thead').length > 0 });
  });

  // ── Images ──────────────────────────────────────────────────────────────────
  doc.images = [];
  $root.find('img').each((_, el) => {
    const $img = $(el);
    const src = $img.attr('src') || $img.attr('data-src') || '';
    if (!src) return;
    let abs = src;
    try {
      abs = new URL(src, url).href;
    } catch {
      /* keep raw */
    }
    doc.images.push({
      src: abs,
      raw: src,
      alt: $img.attr('alt') ?? null,
      width: $img.attr('width') || '',
      height: $img.attr('height') || '',
      loading: $img.attr('loading') || '',
      isNextOptimised: /\/_next\/image/.test(src),
    });
  });

  // ── Links ───────────────────────────────────────────────────────────────────
  const origin = new URL(url).origin;
  doc.links = [];
  $root.find('a[href]').each((_, el) => {
    const href = $(el).attr('href') || '';
    if (!href || href.startsWith('#') || /^(mailto|tel|javascript):/i.test(href)) return;
    let abs;
    try {
      abs = new URL(href, url).href;
    } catch {
      return;
    }
    doc.links.push({
      href: abs,
      raw: href,
      text: norm($(el).text()),
      internal: abs.startsWith(origin),
      rel: $(el).attr('rel') || '',
      target: $(el).attr('target') || '',
    });
  });

  // Site-wide chrome links, checked separately (buy / inquire buttons live here).
  doc.chromeLinks = [];
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || '';
    if (!href) return;
    let abs;
    try {
      abs = new URL(href, url).href;
    } catch {
      return;
    }
    doc.chromeLinks.push({ href: abs, text: norm($(el).text()) });
  });

  // ── Text ────────────────────────────────────────────────────────────────────
  const $clean = cheerio.load($.html($root));
  $clean(CHROME_SELECTORS).remove();
  doc.rawText = $clean.root().text().replace(/\u00a0/g, ' ');
  doc.text = norm(doc.rawText);
  doc.wordCount = doc.text.split(/\s+/).filter(Boolean).length;

  /**
   * The same copy, split at every tag boundary and never joined.
   *
   * Flattened container text is useless for whitespace rules: two adjacent
   * paragraphs concatenate into one string, so a trailing space in one and a
   * leading space in the next read as a double space that exists nowhere in the
   * copy. Non-breaking spaces are deliberately left as U+00A0 here rather than
   * normalised to a space, for the same reason — a trailing &nbsp; must not be
   * able to combine with inter-element whitespace and fake a defect.
   */
  doc.textSegments = $.html($root)
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .split(/<[^>]*>/)
    .map(decodeEntities)
    .filter((s) => /\S/.test(s));

  // ── Typography inputs ───────────────────────────────────────────────────────
  // Inline font styling inside the body is the fingerprint of a Word or Docs
  // paste. The stylesheet is shared by every report and is consistent by
  // construction; what varies per report is what the editor pasted in.
  doc.inlineStyles = [];
  $root.find('[style]').each((_, el) => {
    const style = $(el).attr('style') || '';
    if (!/font|line-height|letter-spacing|color|background/i.test(style)) return;
    doc.inlineStyles.push({
      tag: el.tagName,
      style: norm(style),
      text: norm($(el).text()).slice(0, 70),
    });
  });

  doc.fontTags = [];
  $root.find('font, basefont, big, small, center').each((_, el) => {
    doc.fontTags.push({ tag: el.tagName, text: norm($(el).text()).slice(0, 70) });
  });

  doc.classedSpans = [];
  $root.find('span[class], p[class]').each((_, el) => {
    const cls = $(el).attr('class') || '';
    if (!/mso|Normal|Body|Char|western|c\d+|s\d+/i.test(cls)) return;
    doc.classedSpans.push({ tag: el.tagName, cls: norm(cls), text: norm($(el).text()).slice(0, 70) });
  });


  doc.paragraphs = [];
  $root.find('p, li').each((_, el) => {
    const t = norm($(el).text());
    if (t.length > 20) doc.paragraphs.push({ text: t, tag: el.tagName, boldLead: /^<(strong|b)>/i.test(($(el).html() || '').trim()) });
  });

  // ── Template + scope detection ──────────────────────────────────────────────
  // ── Template + scope detection ──────────────────────────────────────────────
  // Scored on body markers only. The "Customization Offered" panel in the right
  // rail appears on every report page, so treating it as a Template B marker
  // misclassified pages and then demanded a section they never needed.
  const headingText = doc.headings.map((h) => h.text.toLowerCase());
  const has = (re) => headingText.some((t) => re.test(t));

  const aMarkers = [
    has(/^market definition$/),
    has(/^key market highlights:?$/),
    has(/^key companies/),
    has(/^recent developments:?$/),
    has(/report snapshot$/),
    has(/^regulatory frameworks:?$/),
  ].filter(Boolean).length;

  const bMarkers = [
    /key insight\s*:/i.test(doc.text),
    has(/^customization options for/),
    has(/^what growth opportunities and risks/),
    /strategic market intelligence/i.test(doc.subtitle),
  ].filter(Boolean).length;

  doc.templateScores = { a: aMarkers, b: bMarkers };
  doc.template = aMarkers > bMarkers ? 'A' : bMarkers > aMarkers ? 'B' : aMarkers === 0 ? 'unknown' : 'A';

  // Lookahead rather than \b: there is no word boundary between the final "."
  // of "U.S." and the following space, so \b silently matched nothing and every
  // country report was classified as global.
  const countryPrefix = doc.h1.match(
    /^(U\.S\.|U\.K\.|U\.A\.E\.|US|UK|UAE|China|India|Japan|Germany|France|Canada|Brazil|Australia|Italy|Spain|Mexico|South Korea|Saudi Arabia)(?=\s|$)/i
  );
  doc.scope = countryPrefix ? 'country' : /^global\b/i.test(doc.h1) ? 'global' : 'global';
  doc.country = countryPrefix ? countryPrefix[1] : '';

  // Market name with the leading scope word removed, used as the primary keyword.
  doc.marketName = norm(doc.h1.replace(/^(global|u\.s\.|us|uk|u\.k\.)\s+/i, ''));
  doc.h1Slug = slugify(doc.h1);

  return doc;
}
