import { probe } from '../fetchPage.js';
import { pool, unique } from '../util.js';

const MAX_LINKS = 80;

/**
 * Async because it actually requests every link. Everything else in the rule set
 * is offline and instant; this is the slow part of a run.
 */
export default async function linkRules(doc) {
  const issues = [];

  const links = dedupe(doc.links);
  const internal = links.filter((l) => l.internal);
  const external = links.filter((l) => !l.internal);

  // ── LINK-01 · internal report links use two URL shapes ──────────────────────
  // Both shapes resolve. The checklist asks whether internal links *work*, and
  // they do, so this is recorded as an observation and never fails the page or
  // touches a sheet column. Consolidating them would tidy up link equity and
  // analytics, but that is a decision for you, not a defect for a QA tool to
  // assert.
  const reportLike = internal.filter((l) => /-market-\d+\/?$/.test(new URL(l.href).pathname));
  const withPrefix = reportLike.filter((l) => new URL(l.href).pathname.startsWith('/report/'));
  const withoutPrefix = reportLike.filter((l) => !new URL(l.href).pathname.startsWith('/report/'));
  if (withoutPrefix.length) {
    issues.push({
      ruleId: 'LINK-01',
      category: 'Links',
      severity: 'info',
      items: [],
      title: 'Internal report links use two different URL patterns',
      where: 'Body copy',
      found: `${withoutPrefix.length} without /report/: ${withoutPrefix.slice(0, 3).map((l) => new URL(l.href).pathname).join(', ')}${
        withPrefix.length ? ` · ${withPrefix.length} with /report/` : ''
      }`,
      expected: '/report/<slug>-<id>',
      fix: `Rewrite ${withoutPrefix.map((l) => `“${l.text}”`).join(', ')} to the /report/ form.`,
    });
  }

  // ── LINK-02 · status codes ──────────────────────────────────────────────────
  const toCheck = [...internal, ...external].slice(0, MAX_LINKS);
  const probed = await pool(toCheck, 6, async (l) => ({ ...l, ...(await probe(l.href)) }));

  const brokenInternal = probed.filter((p) => p.internal && (!p.ok || p.status >= 400));
  const brokenExternal = probed.filter((p) => !p.internal && (!p.ok || p.status >= 400));

  issues.push({
    ruleId: 'LINK-00',
    category: 'Links',
    severity: 'info',
    items: [],
    title: `Link sweep: ${probed.length} checked, ${probed.length - brokenInternal.length - brokenExternal.length} responding`,
    where: `${internal.length} internal · ${external.length} external`,
    found: brokenInternal.length + brokenExternal.length === 0
      ? 'every link returned a success status'
      : `${brokenInternal.length} internal and ${brokenExternal.length} external not responding`,
    expected: '',
    fix: '',
  });

  for (const b of brokenInternal) {
    issues.push({
      ruleId: 'LINK-02',
      category: 'Links',
      severity: 'fail',
      items: ['M18'],
      title: `Internal link returns ${b.status || b.error || 'no response'}`,
      where: `Anchor: “${b.text || '(no text)'}”`,
      found: b.href,
      expected: 'HTTP 200',
      fix: 'Repoint or remove the link.',
    });
  }
  for (const b of brokenExternal) {
    issues.push({
      ruleId: 'LINK-03',
      category: 'Links',
      severity: b.error === 'timeout' ? 'warn' : 'fail',
      items: ['M19'],
      title: `External link returns ${b.status || b.error || 'no response'}`,
      where: `Anchor: “${b.text || '(no text)'}”`,
      found: b.href,
      expected: 'HTTP 200',
      fix:
        b.error === 'timeout'
          ? 'The host did not answer in time. Open it manually before deciding.'
          : 'Source pages move. Find the current URL or cite an archive copy.',
    });
  }

  // ── LINK-04 · external links open in a new tab with rel protection ──────────
  const unsafeTargets = external.filter((l) => l.target === '_blank' && !/noopener/.test(l.rel));
  if (unsafeTargets.length) {
    issues.push({
      ruleId: 'LINK-04',
      category: 'Links',
      severity: 'warn',
      items: ['M19'],
      title: 'External links open in a new tab without rel="noopener"',
      where: 'Body copy',
      found: unsafeTargets.slice(0, 3).map((l) => l.href).join(', '),
      expected: 'rel="noopener noreferrer"',
      fix: 'Add rel="noopener noreferrer" to target="_blank" links.',
    });
  }

  // ── LINK-05 · http:// links ─────────────────────────────────────────────────
  const insecure = links.filter((l) => l.href.startsWith('http://'));
  if (insecure.length) {
    issues.push({
      ruleId: 'LINK-05',
      category: 'Links',
      severity: 'fail',
      items: ['M19'],
      title: 'Link uses http:// instead of https://',
      where: 'Body copy',
      found: insecure.slice(0, 3).map((l) => l.href).join(', '),
      expected: 'https://',
      fix: 'Switch to the https URL.',
    });
  }

  // ── LINK-06 · bare-URL or generic anchor text ───────────────────────────────
  const badAnchors = links.filter(
    (l) => /^https?:\/\//i.test(l.text) || /^(click here|here|read more|link|this)$/i.test(l.text)
  );
  if (badAnchors.length) {
    issues.push({
      ruleId: 'LINK-06',
      category: 'Links',
      severity: 'warn',
      items: ['M20'],
      title: 'Generic or bare-URL anchor text',
      where: 'Body copy',
      found: unique(badAnchors.map((l) => l.text)).slice(0, 4).join(' · '),
      expected: 'Descriptive anchor text, e.g. the source organisation name',
      fix: 'Replace with the publisher or study name.',
    });
  }

  // ── LINK-07 · sample / buy CTA present and pointed at the right report ──────
  const cta = doc.chromeLinks.filter((l) => /license-variant|\/connect|sample/i.test(l.href));
  if (!cta.length) {
    issues.push({
      ruleId: 'LINK-07',
      category: 'Links',
      severity: 'fail',
      items: ['R33'],
      title: 'No Buy Now / Inquire CTA found on the page',
      where: 'Page chrome',
      found: '(none)',
      expected: 'license-variant or connect link',
      fix: 'The purchase path is missing. Check the template rendered.',
    });
  } else if (doc.reportId) {
    const mismatched = cta.filter((l) => /license-variant/.test(l.href) && !l.href.includes(`id=${doc.reportId}`));
    if (mismatched.length) {
      issues.push({
        ruleId: 'LINK-07',
        category: 'Links',
        severity: 'fail',
        items: ['R33'],
        title: 'Buy Now link points at a different report id',
        where: 'Buy Now CTA',
        found: mismatched[0].href,
        expected: `id=${doc.reportId}`,
        fix: `Correct the CTA to id=${doc.reportId}. As it stands the button sells the wrong report.`,
      });
    }
  }

  // ── LINK-08 · methodology link ──────────────────────────────────────────────
  if (!doc.chromeLinks.some((l) => /research-process|methodology/i.test(l.href))) {
    issues.push({
      ruleId: 'LINK-08',
      category: 'Links',
      severity: 'warn',
      items: ['R31'],
      title: 'No link to the research methodology',
      where: 'Page chrome',
      found: '(none)',
      expected: '/research-process',
      fix: 'Add the methodology link so the numbers are traceable.',
    });
  }

  // ── LINK-09 · TOC / snapshot tabs ───────────────────────────────────────────
  const tabs = ['/snapshot/', '/toc/'].filter(
    (p) => !doc.chromeLinks.some((l) => l.href.includes(p + doc.slug))
  );
  if (tabs.length && doc.pageType === 'report') {
    issues.push({
      ruleId: 'LINK-09',
      category: 'Links',
      severity: 'fail',
      items: ['M18'],
      title: 'Report tab links are missing or point at the wrong slug',
      where: 'Description / Snapshot / Table Of Content tabs',
      found: `missing: ${tabs.map((t) => t + doc.slug).join(', ')}`,
      expected: `/snapshot/${doc.slug} and /toc/${doc.slug}`,
      fix: 'Fix the tab links — they must carry this report’s slug.',
    });
  }

  return { issues, probed };
}

function dedupe(links) {
  const seen = new Set();
  return links.filter((l) => {
    if (seen.has(l.href)) return false;
    seen.add(l.href);
    return true;
  });
}
