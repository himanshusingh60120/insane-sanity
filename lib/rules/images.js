import { probe } from '../fetchPage.js';
import { pool, norm } from '../util.js';

export default async function imageRules(doc) {
  const issues = [];
  const images = doc.images.filter((i) => !/\.svg($|\?)/i.test(i.src));

  // ── IMG-01 · every content image loads ──────────────────────────────────────
  const probed = await pool(images.slice(0, 25), 5, async (img) => ({ ...img, ...(await probe(img.src)) }));
  for (const p of probed) {
    if (!p.ok || p.status >= 400) {
      issues.push({
        ruleId: 'IMG-01',
        category: 'Images',
        severity: 'fail',
        items: ['M16'],
        title: `Image returns ${p.status || p.error || 'no response'}`,
        where: p.alt ? `“${p.alt.slice(0, 60)}”` : 'unnamed image',
        found: p.src,
        expected: 'HTTP 200 with an image content type',
        fix: 'Re-upload the asset or fix the path.',
      });
    } else if (p.type && !/^image\//.test(p.type) && !p.isNextOptimised) {
      issues.push({
        ruleId: 'IMG-01',
        category: 'Images',
        severity: 'warn',
        items: ['M16'],
        title: 'Image URL does not serve an image content type',
        where: p.alt || p.src,
        found: p.type,
        expected: 'image/webp, image/png …',
        fix: 'Check the asset — the server is returning something else.',
      });
    }
  }

  // ── IMG-02 · alt text present and meaningful ────────────────────────────────
  for (const img of images) {
    const alt = img.alt == null ? null : norm(img.alt);
    if (alt === null) {
      issues.push({
        ruleId: 'IMG-02',
        category: 'Images',
        severity: 'fail',
        items: ['M21'],
        title: 'Image has no alt attribute',
        where: img.src,
        found: '(missing)',
        expected: `${doc.h1} Size & Share, By Revenue, ${forecast(doc)}`,
        fix: 'Add descriptive alt text following the house pattern.',
      });
      continue;
    }
    if (alt === '') continue; // deliberately decorative
    if (/^[\w-]+\.(webp|png|jpe?g|gif)$/i.test(alt) || /^\d+$/.test(alt)) {
      issues.push({
        ruleId: 'IMG-02',
        category: 'Images',
        severity: 'fail',
        items: ['M21'],
        title: 'Alt text is a filename, not a description',
        where: img.src,
        found: alt,
        expected: `${doc.h1} Size & Share, By Revenue, ${forecast(doc)}`,
        fix: 'Replace the filename with a description.',
      });
    }
    if (alt.length > 125) {
      issues.push({
        ruleId: 'IMG-02',
        category: 'Images',
        severity: 'warn',
        items: ['M21'],
        title: 'Alt text is longer than screen readers announce comfortably',
        where: img.src,
        found: `${alt.length} characters`,
        expected: 'Under 125 characters',
        fix: 'Shorten the alt text.',
      });
    }
  }

  // ── IMG-03 · chart alt text carries the market name and forecast years ──────
  const charts = images.filter((i) => /Size|Share|Revenue|Region/i.test(i.alt || ''));
  const range = forecast(doc);
  for (const c of charts) {
    const alt = norm(c.alt || '');
    const problems = [];
    if (range && !alt.includes(range) && !alt.replace(/–|—/g, '-').includes(range)) {
      problems.push(`year range “${range}” missing`);
    }
    const marketToken = doc.marketName.split(' ').slice(0, 2).join(' ');
    if (marketToken && !alt.toLowerCase().includes(marketToken.toLowerCase())) {
      problems.push(`market name “${marketToken}” missing`);
    }
    if (problems.length) {
      issues.push({
        ruleId: 'IMG-03',
        category: 'Images',
        severity: 'fail',
        items: ['M17', 'M21'],
        title: 'Chart alt text does not match the report',
        where: c.src.split('/').pop(),
        found: `${alt} — ${problems.join('; ')}`,
        expected: `${doc.h1} Size & Share, By Revenue, ${range}`,
        fix: 'Rewrite the alt text so the chart is identifiable and the years match the forecast period.',
      });
    }
  }

  // ── IMG-04 · both standard charts present ───────────────────────────────────
  if (doc.pageType === 'report' && doc.template === 'A') {
    const hasRevenue = charts.some((c) => /by revenue/i.test(c.alt || ''));
    const hasRegion = charts.some((c) => /by region|by country/i.test(c.alt || ''));
    const missing = [!hasRevenue && 'By Revenue', !hasRegion && 'By Region / By Country'].filter(Boolean);
    if (missing.length) {
      issues.push({
        ruleId: 'IMG-04',
        category: 'Images',
        severity: 'fail',
        items: ['M17'],
        title: 'Standard report chart missing',
        where: 'Body',
        found: `missing: ${missing.join(', ')}`,
        expected: 'Both the revenue chart and the region chart',
        fix: 'Every Template A report carries both charts. Add the missing one.',
      });
    }
  }

  // ── IMG-05 · lazy loading below the fold ────────────────────────────────────
  const eager = images.slice(1).filter((i) => i.loading !== 'lazy' && !i.isNextOptimised);
  if (eager.length > 3) {
    issues.push({
      ruleId: 'IMG-05',
      category: 'Technical',
      severity: 'warn',
      items: ['M22'],
      title: 'Below-the-fold images are not lazy loaded',
      where: 'Body',
      found: `${eager.length} images without loading="lazy"`,
      expected: 'loading="lazy" on everything below the fold',
      fix: 'Add lazy loading to keep the page fast on mobile.',
    });
  }

  return { issues, probed };
}

function forecast(doc) {
  const m = doc.subtitle.match(/(20\d{2})\s*[-–—]\s*(20\d{2})/);
  return m ? `${m[1]}-${m[2]}` : '';
}
