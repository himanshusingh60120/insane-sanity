import { norm, slugify, reveal } from '../util.js';

const BRAND_SUFFIX = '| Kings Research';

export default function metaRules(doc) {
  const issues = [];
  const m = doc.meta;
  const title = doc.title;
  const desc = m['description'] || '';

  // ── META-01 · title present, sized, brand-suffixed ──────────────────────────
  if (!title) {
    issues.push(fail('META-01', ['M03'], 'Meta title is missing', '<title>', '(empty)', 'Market name + benefit + brand', 'Write a title tag.'));
  } else {
    if (title.length > 65) {
      issues.push(fail('META-01', ['M03'], 'Meta title is too long for search results', '<title>', `${title.length} characters`, '50–60 characters', `Trim ${title.length - 60} characters. Google truncates past ~60.`));
    }
    if (title.length < 25) {
      issues.push(fail('META-01', ['M03'], 'Meta title is too short', '<title>', `${title.length} characters`, '50–60 characters', 'Expand the title.'));
    }
    if (!title.includes(BRAND_SUFFIX)) {
      issues.push(fail('META-01', ['M03'], 'Meta title is missing the brand suffix', '<title>', title, `… ${BRAND_SUFFIX}`, `Append “ ${BRAND_SUFFIX}”.`));
    }
  }

  // ── META-02 · punctuation and spacing inside the title ──────────────────────
  // Baseline miss: “Market Size & Growth,2033 | Kings Research” — no space
  // after the comma. Invisible in a CMS field, visible in every SERP.
  const punctuation = [
    { re: /[,;:](?=\S)/, label: 'missing space after punctuation' },
    { re: / {2,}/, label: 'double space' },
    { re: /\s+[,.]/, label: 'space before punctuation' },
    { re: /\b(\w+)\s+\1\b/i, label: 'repeated word' },
  ];
  for (const p of punctuation) {
    const hit = title.match(p.re);
    if (hit) {
      issues.push(fail('META-02', ['M02'], `Meta title has a ${p.label}`, '<title>', reveal(title), 'Clean punctuation and single spaces', `Fix the ${p.label} near “${hit[0].trim() || '␣␣'}”.`));
    }
  }

  // ── META-03 · description present and sized ─────────────────────────────────
  if (!desc) {
    issues.push(fail('META-03', ['M04'], 'Meta description is missing', 'meta[name=description]', '(empty)', '140–160 characters', 'Write a meta description with the headline figure and CAGR.'));
  } else {
    if (desc.length > 165) {
      issues.push(fail('META-03', ['M04'], 'Meta description is too long', 'meta[name=description]', `${desc.length} characters`, '140–160 characters', `Trim ${desc.length - 160} characters.`));
    }
    if (desc.length < 90) {
      issues.push(fail('META-03', ['M04'], 'Meta description is too short', 'meta[name=description]', `${desc.length} characters`, '140–160 characters', 'Expand it — short descriptions get rewritten by Google.'));
    }
    if (!/\d/.test(desc)) {
      issues.push(fail('META-03', ['M04'], 'Meta description carries no figure', 'meta[name=description]', desc.slice(0, 80), 'Include the forecast value and CAGR', 'Add the headline number; every other report does.'));
    }
  }

  // ── META-04 · keywords formatting ───────────────────────────────────────────
  const keywords = m['keywords'] || '';
  if (keywords) {
    if (/\.\s*$/.test(keywords)) {
      issues.push(fail('META-04', ['M04'], 'Keyword list ends with a full stop', 'meta[name=keywords]', `…${keywords.slice(-40)}`, 'No trailing period', 'Remove the trailing period — the list is comma-separated.'));
    }
    const parts = keywords.split(',').map(norm).filter(Boolean);
    if (parts.some((p) => p !== norm(p) || / {2,}/.test(p))) {
      issues.push(fail('META-04', ['M04'], 'Keyword list has stray spacing', 'meta[name=keywords]', reveal(keywords.slice(0, 90)), 'Comma + single space between terms', 'Normalise the separators.'));
    }
  }

  // ── META-05 · canonical ─────────────────────────────────────────────────────
  if (!doc.canonical) {
    issues.push(fail('META-05', ['M24'], 'Canonical link is missing', 'link[rel=canonical]', '(none)', doc.url, 'Add a self-referencing canonical.'));
  } else if (stripSlash(doc.canonical) !== stripSlash(doc.url)) {
    issues.push(fail('META-05', ['M24'], 'Canonical points somewhere else', 'link[rel=canonical]', doc.canonical, doc.url, 'Point the canonical at this URL.'));
  }

  // ── META-06 · robots ────────────────────────────────────────────────────────
  const robots = (m['robots'] || '').toLowerCase();
  if (robots.includes('noindex')) {
    issues.push(fail('META-06', ['M22', 'M24'], 'Page is set to noindex', 'meta[name=robots]', robots, 'index, follow', 'Remove noindex before this goes live.'));
  }

  // ── META-07 · Open Graph and Twitter card ───────────────────────────────────
  const og = {
    title: m['og:title'],
    description: m['og:description'],
    image: m['og:image'],
    url: m['og:url'],
    type: m['og:type'],
  };
  const missingOg = Object.entries(og).filter(([, v]) => !v).map(([k]) => `og:${k}`);
  if (missingOg.length) {
    issues.push(fail('META-07', ['M25'], 'Open Graph tags missing', '<head>', missingOg.join(', '), 'og:title, og:description, og:image, og:url, og:type', 'Add the missing tags or the social preview renders blank.'));
  }
  if (og.url && stripSlash(og.url) !== stripSlash(doc.url)) {
    issues.push(fail('META-07', ['M25'], 'og:url does not match the page URL', 'meta[property=og:url]', og.url, doc.url, 'Correct og:url.'));
  }
  if (og.title && title && norm(og.title) !== norm(title)) {
    issues.push(warn('META-07', ['M25'], 'og:title differs from the page title', 'meta[property=og:title]', `${og.title}\nvs\n${title}`, 'Same string', 'Keep the two in sync unless the difference is deliberate.'));
  }
  if (!m['twitter:card']) {
    issues.push(fail('META-07', ['M25'], 'Twitter card type missing', '<head>', '(none)', 'summary_large_image', 'Add meta[name=twitter:card].'));
  }
  if (!m['og:image:alt']) {
    issues.push(warn('META-07', ['M25', 'M21'], 'og:image has no alt text', '<head>', '(none)', 'Descriptive alt for the share image', 'Add og:image:alt.'));
  }

  // ── META-08 · viewport ──────────────────────────────────────────────────────
  const viewport = m['viewport'] || '';
  if (!/width=device-width/.test(viewport)) {
    issues.push(fail('META-08', ['M23'], 'Viewport meta is missing or fixed-width', 'meta[name=viewport]', viewport || '(none)', 'width=device-width, initial-scale=1', 'Add the responsive viewport tag.'));
  }
  if (/user-scalable\s*=\s*no|maximum-scale\s*=\s*1/.test(viewport)) {
    issues.push(fail('META-08', ['M23'], 'Viewport blocks pinch-zoom', 'meta[name=viewport]', viewport, 'width=device-width, initial-scale=1', 'Remove user-scalable=no / maximum-scale — it fails accessibility.'));
  }

  // ── META-09 · slug shape ────────────────────────────────────────────────────
  const slug = doc.slug;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    issues.push(fail('META-09', ['M05'], 'URL slug is not clean lowercase-hyphen', 'URL', slug, 'lowercase-words-separated-by-hyphens-<id>', 'Rewrite the slug; no capitals, underscores or repeated hyphens.'));
  }
  if (!doc.reportId) {
    issues.push(fail('META-09', ['M05'], 'URL slug has no report id suffix', 'URL', slug, '<market-name>-market-<id>', 'Append the numeric report id.'));
  }
  if (!/-market-\d+$/.test(slug) && doc.pageType === 'report') {
    issues.push(warn('META-09', ['M05'], 'Slug does not follow the “…-market-<id>” pattern', 'URL', slug, 'us-spatial-biology-market-3124', 'Match the pattern used by every other report.'));
  }

  // ── META-10 · slug matches the H1 ───────────────────────────────────────────
  if (doc.h1) {
    const expected = slugify(doc.h1).replace(/^u-s-/, 'us-');
    const actual = doc.slugBody.replace(/^u-s-/, 'us-');
    if (expected && actual && expected !== actual) {
      const missing = expected.split('-').filter((t) => t.length > 2 && !actual.includes(t));
      issues.push(
        (missing.length ? fail : warn)(
          'META-10',
          ['M06', 'M05'],
          'URL slug does not match the H1',
          'URL vs H1',
          `slug: ${actual}\nH1 slugified: ${expected}`,
          expected,
          missing.length
            ? `The slug is missing “${missing.join(', ')}”. Either fix the slug or the H1.`
            : 'Minor difference — confirm the slug is the intended one before publishing.'
        )
      );
    }
  }

  // ── META-11 · primary keyword coverage ──────────────────────────────────────
  const keyword = doc.marketName.toLowerCase();
  if (keyword) {
    const places = {
      'meta title': title.toLowerCase(),
      'meta description': desc.toLowerCase(),
      H1: doc.h1.toLowerCase(),
      'first paragraph': (doc.paragraphs[0]?.text || '').toLowerCase(),
    };
    const missing = Object.entries(places)
      .filter(([, v]) => v && !v.includes(keyword.replace(/\s*\(.*?\)\s*/g, ' ').trim().split(' ').slice(0, 2).join(' ')))
      .map(([k]) => k);
    if (missing.length) {
      issues.push(warn('META-11', ['M20'], 'Primary keyword missing from some key positions', 'On-page SEO', `“${doc.marketName}” absent from: ${missing.join(', ')}`, 'Present in title, description, H1 and opening paragraph', 'Work the market name into the positions listed.'));
    }
  }

  // ── META-12 · structured data ───────────────────────────────────────────────
  if (!doc.jsonLd.length) {
    issues.push(warn('META-12', ['M25'], 'No JSON-LD structured data on the page', '<head>', '(none)', 'Product / Report or FAQPage schema', 'Add structured data so the FAQ block is eligible for rich results.'));
  } else if (doc.jsonLd.some((j) => j.__parseError)) {
    issues.push(fail('META-12', ['M25'], 'JSON-LD block does not parse', 'script[type=application/ld+json]', 'invalid JSON', 'Valid JSON-LD', 'Fix the malformed structured data.'));
  }

  return issues;
}

function stripSlash(u = '') {
  return String(u).replace(/\/+$/, '').toLowerCase();
}

function fail(ruleId, items, title, where, found, expected, fix) {
  return { ruleId, category: 'SEO & Meta', severity: 'fail', items, title, where, found, expected, fix };
}
function warn(ruleId, items, title, where, found, expected, fix) {
  return { ruleId, category: 'SEO & Meta', severity: 'warn', items, title, where, found, expected, fix };
}
