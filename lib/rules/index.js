import casingRules from './casing.js';
import structureRules from './structure.js';
import numberRules from './numbers.js';
import metaRules from './meta.js';
import linkRules from './links.js';
import imageRules from './images.js';
import technicalRules from './technical.js';
import blogPrRules from './blogpr.js';
import { itemsForPageType, itemFor } from '../checklist.js';
import { unique } from '../util.js';

/**
 * Compares this page's section signature against the signature shared by the
 * recent reports fetched from the sitemap. A section that every recent report
 * has and this one does not is the strongest available signal that a step was
 * skipped, and it needs no judgement call to detect.
 */
function baselineRules(doc, baseline) {
  const issues = [];
  if (!baseline || !baseline.reports || baseline.reports.length < 2) return issues;

  const peers = baseline.reports.filter((r) => r.template === doc.template && r.url !== doc.url);
  if (peers.length < 2) return issues;

  const mine = new Set(doc.headings.filter((h) => h.level === 2).map((h) => normaliseHeading(h.text)));
  const tally = new Map();
  for (const peer of peers) {
    for (const h of unique(peer.h2s.map(normaliseHeading))) {
      tally.set(h, (tally.get(h) || 0) + 1);
    }
  }

  const universal = [...tally.entries()]
    .filter(([, count]) => count === peers.length)
    .map(([h]) => h)
    .filter((h) => h && !h.endsWith('?'));

  const missing = universal.filter((h) => !mine.has(h));
  if (missing.length) {
    issues.push({
      ruleId: 'BASE-01',
      category: 'Formatting',
      severity: 'fail',
      items: ['F15', 'M15'],
      title: 'Section present on every recent report is missing here',
      where: `Compared against ${peers.length} recent Template ${doc.template} reports`,
      found: `missing: ${missing.join(', ')}`,
      expected: universal.join(' · '),
      fix: `Add ${missing.map((m) => `“${m}”`).join(', ')} to match the reports published alongside this one.`,
    });
  }

  const extra = [...mine].filter((h) => !tally.has(h) && !h.endsWith('?') && h.length > 3);
  if (extra.length) {
    issues.push({
      ruleId: 'BASE-02',
      category: 'Formatting',
      severity: 'warn',
      items: ['F15'],
      title: 'Section heading not used by any recent report',
      where: `Compared against ${peers.length} recent Template ${doc.template} reports`,
      found: extra.join(', '),
      expected: 'Section names shared with peer reports',
      fix: 'Either this is a new section worth adding to the template, or the heading was typed by hand. Confirm which.',
    });
  }

  return issues;
}

function normaliseHeading(text) {
  return String(text)
    .toLowerCase()
    .replace(/[“”"’']/g, '')
    .replace(/\s+/g, ' ')
    .replace(/:$/, '')
    .replace(/^.*?\bmarket\b\s+(report snapshot|overview|segmentation)$/, '$1')
    .replace(/^key companies in the .*/, 'key companies')
    .trim();
}

/** Runs every rule module and folds the issues into per-item Yes/No verdicts. */
export async function runAllRules(doc, ctx = {}) {
  const sync = [
    ...casingRules(doc),
    ...structureRules(doc),
    ...numberRules(doc),
    ...metaRules(doc),
    ...technicalRules(doc, ctx),
    ...blogPrRules(doc),
    ...baselineRules(doc, ctx.baseline),
  ];

  const [linkResult, imageResult] = await Promise.all([linkRules(doc), imageRules(doc)]);

  const issues = [...sync, ...linkResult.issues, ...imageResult.issues, ...(ctx.aiIssues || [])]
    .filter((i) => i.severity !== 'info')
    .map((i) => ({ verifiedBy: 'Deterministic rule', ...i }));

  const info = sync.filter((i) => i.severity === 'info');

  return {
    issues,
    info,
    probes: { links: linkResult.probed, images: imageResult.probed },
    verdicts: buildVerdicts(doc, issues, ctx),
  };
}

/**
 * A checklist row is "No" when at least one rule mapped to it failed.
 * Warnings never flip a row to No — they are surfaced in the tool and in the
 * issue log, but the sheet stays a clean pass/fail signal.
 */
function buildVerdicts(doc, issues, ctx) {
  const items = itemsForPageType(doc.pageType);
  const verdicts = {};

  for (const item of items) {
    const related = issues.filter((i) => (i.items || []).includes(item.key));
    const fails = related.filter((i) => i.severity === 'fail');
    const warns = related.filter((i) => i.severity === 'warn');

    let value;
    if (item.mode === 'ai-verify' && !ctx.aiAvailable) {
      value = 'Not run';
    } else {
      value = fails.length ? 'No' : 'Yes';
    }

    verdicts[item.key] = {
      key: item.key,
      category: item.category,
      item: item.item,
      mode: item.mode,
      value,
      failCount: fails.length,
      warnCount: warns.length,
      issues: related,
    };
  }

  return verdicts;
}

export { itemFor };
