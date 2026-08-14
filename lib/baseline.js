import { fetchPage, fetchSitemapUrls } from './fetchPage.js';
import { parsePage } from './parse.js';
import { pool } from './util.js';

/**
 * Reads the reports sitemap, takes the most recently published reports and
 * records what they have in common. "Formatting is important, it should be
 * regularised" is only checkable against something, and the last few published
 * reports are the most honest available definition of current house style.
 *
 * Reports are ordered by the numeric id in the slug, which increments with
 * publication, so the tail of that ordering is the newest work.
 */
export async function buildBaseline({ sitemapUrl, limit = 4, excludeUrl = '' } = {}) {
  const urls = await fetchSitemapUrls(sitemapUrl || process.env.SITEMAP_URL || 'https://www.kingsresearch.com/sitemap-reports.xml');

  const ranked = urls
    .filter((u) => /\/report\//.test(u))
    .map((u) => ({ url: u, id: Number((u.match(/-(\d+)\/?$/) || [])[1] || 0) }))
    .filter((r) => r.id > 0 && r.url.replace(/\/+$/, '') !== excludeUrl.replace(/\/+$/, ''))
    .sort((a, b) => b.id - a.id)
    .slice(0, limit);

  if (!ranked.length) {
    return { available: false, reason: 'No report URLs found in the sitemap', reports: [] };
  }

  const reports = await pool(ranked, 3, async ({ url }) => {
    try {
      const page = await fetchPage(url);
      const doc = parsePage({ url, html: page.html, css: page.css, status: page.status, ttfbMs: page.ttfbMs });
      return signature(doc);
    } catch (err) {
      return { url, error: String(err.message || err) };
    }
  });

  return {
    available: true,
    fetchedAt: new Date().toISOString(),
    sitemapCount: urls.length,
    reports: reports.filter((r) => r && !r.error),
    failures: reports.filter((r) => r && r.error),
  };
}

/** The comparable facts about a page, small enough to cache and diff. */
export function signature(doc) {
  return {
    url: doc.url,
    id: doc.reportId,
    h1: doc.h1,
    template: doc.template,
    scope: doc.scope,
    h2s: doc.headings.filter((h) => h.level === 2).map((h) => h.text),
    h3s: doc.headings.filter((h) => h.level === 3).map((h) => h.text),
    tableHeaders: doc.tables.map((t) => t.headerCells),
    hasReviewedBy: Boolean(doc.metaBar.reviewedBy),
    baseYear: doc.metaBar.baseYear,
    titleLength: doc.title.length,
    descriptionLength: (doc.meta['description'] || '').length,
    keywordsTrailingPeriod: /\.\s*$/.test(doc.meta['keywords'] || ''),
    currency: /USD\s*\d/.test(doc.text) ? 'USD' : /\$\s*\d/.test(doc.text) ? '$' : 'none',
    snapshotIsTable: doc.tables.some((t) => t.rows.some((r) => /^by\s/i.test(r[0] || ''))),
    segmentationBulletsBold: doc.paragraphs.filter((p) => p.tag === 'li' && /^by\s/i.test(p.text) && p.boldLead).length,
    segmentationBullets: doc.paragraphs.filter((p) => p.tag === 'li' && /^by\s/i.test(p.text)).length,
    wordCount: doc.wordCount,
  };
}

/** Human-readable drift report used by /api/baseline. */
export function summariseDrift(reports) {
  const drift = [];
  const compare = (label, get) => {
    const values = reports.map((r) => ({ url: r.url, value: get(r) }));
    const distinct = Array.from(new Set(values.map((v) => JSON.stringify(v.value))));
    if (distinct.length > 1) {
      drift.push({
        field: label,
        variants: distinct.map((d) => ({
          value: JSON.parse(d),
          reports: values.filter((v) => JSON.stringify(v.value) === d).map((v) => v.url.split('/').pop()),
        })),
      });
    }
  };

  compare('Template', (r) => r.template);
  compare('Reviewer credited in the meta bar', (r) => r.hasReviewedBy);
  compare('Snapshot rendered as a table', (r) => r.snapshotIsTable);
  compare('Currency notation', (r) => r.currency);
  compare('Keyword list ends with a period', (r) => r.keywordsTrailingPeriod);
  compare('Table header casing', (r) =>
    r.tableHeaders.flat().some((c) => c && c === c.toUpperCase() && c.length > 3) ? 'ALL CAPS' : 'Title Case'
  );
  compare('Segmentation bullets bold the lead-in', (r) =>
    r.segmentationBullets === 0 ? 'no bullets' : r.segmentationBulletsBold === r.segmentationBullets ? 'all bold' : r.segmentationBulletsBold === 0 ? 'none bold' : 'mixed'
  );

  return drift;
}
