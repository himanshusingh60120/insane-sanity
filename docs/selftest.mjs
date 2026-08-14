/**
 * Offline smoke test. Runs the deterministic rule modules against a stub page
 * model built by hand from the real content of report 3124, so the rules can be
 * exercised without a network call or a headless browser.
 *
 *   node docs/selftest.mjs
 *
 * Expected result: the rules fire on the known defects listed at the bottom of
 * docs/formatting-baseline.md. If a rule stops firing after an edit, this test
 * tells you immediately.
 */

import casingRules from '../lib/rules/casing.js';
import numberRules from '../lib/rules/numbers.js';
import metaRules from '../lib/rules/meta.js';
import technicalRules from '../lib/rules/technical.js';
import structureRules from '../lib/rules/structure.js';

// Heading order copied from the live page, H2 and H3 interleaved as they
// actually appear. An artificially grouped list makes the section-order rule
// fire on a page that is correctly ordered.
const OUTLINE = [
  [2, 'Market Definition'],
  [2, 'U.S. Spatial Biology Market Overview'],
  [3, 'Key Market Highlights'],
  [2, 'How is rising R&D investment in oncology and immunology research driving the growth of the spatial biology market?'],
  [2, 'How is the high cost of instruments, reagents, and consumables hindering the growth of the spatial biology market?'],
  [2, 'How is the integration of AI and machine learning for automated spatial data analysis influencing the future of the spatial biology market?'],
  [2, 'U.S. Spatial Biology Market Report Snapshot'],
  [3, 'Market Segmentation'],
  [2, 'What is the market scenario of spatial biology in U.S.?'],
  [3, 'Regulatory Frameworks'],
  [2, 'Competitive Landscape'],
  [3, 'Key Companies In The U.S. Spatial Biology Market'],
  [3, 'Recent Developments'],
];

const BODY = `Market Definition The spatial biology market covers technologies, instruments, reagents, software, and services used to study the spatial organization of cells and molecules within intact tissue.
U.S. Spatial Biology Market Overview The U.S. spatial biology industry size was valued at USD 343.3 million in 2025 and is projected to reach USD 1,251.9 million by 2033, exhibiting a CAGR of 17.55% during the forecast period.
Key Market Highlights The U.S. spatial biology market size was valued at USD 343.3 million in 2025. The market is projected to grow at a CAGR of 17.55% from 2026 to 2033. The spatial transcriptomics segment garnered USD 124.3 million in revenue in 2025. The consumables segment is expected to reach USD 668.1 million by 2033. The oncology segment held a market share of 47.45% in 2025. The Pharma & Biotech segment is expected to reach USD 158.3 million in revenue in 2025.
Market Segmentation The consumables segment held a 53.45% market share in 2025. The FFPE tissue segment is projected to reach USD 704.4 million by 2033.
What is the market scenario of spatial biology in U.S.? The U.S. spatial biology space is transitioning from an early-adoption research tool into a more established component of translational and clinical workflows.
Frequently Asked Questions The U.S. spatial biology market was valued at USD 343.3 million in 2025 and is expected to reach USD 1,251.9 million by 2033, exhibiting a CAGR of 17.55% during the forecast period.`;

const doc = {
  url: 'https://www.kingsresearch.com/report/us-spatial-biology-market-3124',
  status: 200,
  ttfbMs: 900,
  lang: 'en',
  path: '/report/us-spatial-biology-market-3124',
  pageType: 'report',
  slug: 'us-spatial-biology-market-3124',
  slugBody: 'us-spatial-biology-market',
  reportId: '3124',
  template: 'A',
  scope: 'country',
  country: 'U.S.',
  h1: 'U.S. Spatial Biology Market',
  marketName: 'Spatial Biology Market',
  h1Slug: 'u-s-spatial-biology-market',
  subtitle:
    'U.S. Spatial Biology Market Size, Share, Growth & Industry Analysis, By Technology (Spatial Transcriptomics, Spatial Proteomics), By Product, By Sample Type, By Application, By End Users, and Regional Analysis, 2026 - 2033',
  // Note the two spaces before 2026 — exactly as the live page serves it.
  subtitleRaw:
    'U.S. Spatial Biology Market Size, Share, Growth & Industry Analysis, By Technology (Spatial Transcriptomics, Spatial Proteomics), By Product, By Sample Type, By Application, By End Users, and Regional Analysis,  2026 - 2033',
  title: 'U.S. Spatial Biology Market Size & Growth,2033 | Kings Research',
  canonical: 'https://www.kingsresearch.com/report/us-spatial-biology-market-3124',
  meta: {
    description:
      'U.S. spatial biology market to reach USD 1,251.9M by 2033, a 17.55% CAGR from USD 343.3M in 2025, driven by R&D investments and AI integration.',
    keywords:
      'U.S. Spatial Biology Market, U.S. Spatial Biology Market Size, Kings Research Spatial Biology Report',
    robots: 'index, follow',
    viewport: 'width=device-width, initial-scale=1',
    'og:title': 'U.S. Spatial Biology Market Size & Growth,2033 | Kings Research',
    'og:description': 'U.S. spatial biology market to reach USD 1,251.9M by 2033.',
    'og:image': 'https://app.kingsresearch.com/uploads/reports/category/3.jpg',
    'og:image:alt': 'U.S. Spatial Biology Market',
    'og:url': 'https://www.kingsresearch.com/report/us-spatial-biology-market-3124',
    'og:type': 'article',
    'twitter:card': 'summary_large_image',
  },
  jsonLd: [{ '@type': 'Report' }],
  metaBar: {
    pages: '140',
    baseYear: '2025',
    release: 'July 2026',
    author: 'Aswathi P.',
    reviewedBy: '',
    lastUpdated: 'July 2026',
  },
  headings: [
    { level: 1, text: 'U.S. Spatial Biology Market', tag: 'h1', trailingColon: false, cssUppercase: null },
    ...OUTLINE.map(([level, text]) => ({
      level,
      text,
      tag: `h${level}`,
      trailingColon: text.endsWith(':'),
      cssUppercase: null,
    })),
  ],
  tables: [
    {
      headerCells: ['Segmentation', 'Details'],
      rows: [
        ['By Technology', 'Spatial Transcriptomics, Spatial Proteomics'],
        ['By Region', 'U.S.'],
      ],
      hasThead: true,
    },
  ],
  images: [],
  links: [],
  chromeLinks: [
    { href: 'https://www.kingsresearch.com/license-variant?id=3124&cat=2', text: 'Buy Now' },
  ],
  paragraphs: [
    { text: BODY.split('\n')[1], tag: 'p', boldLead: false },
    { text: 'By Technology (Spatial Transcriptomics, Spatial Proteomics): The spatial transcriptomics segment earned USD 124.3 million in 2025.', tag: 'li', boldLead: false },
    { text: 'By Product (Instruments/Platforms, Consumables, and Services): The consumables segment held a 53.45% market share in 2025.', tag: 'li', boldLead: true },
  ],
  rawText: BODY,  // headings live in rawText on a real page; subtitleRaw covers the H2
  text: BODY.replace(/\s+/g, ' ').trim(),
  wordCount: 1400,
  $: makeStub(),
  $root: null,
  html: '<html></html>',
  css: '',
};

function makeStub() {
  const fn = (sel) => ({
    length: sel === 'h1' ? 1 : 0,
    text: () => `${BODY} Frequently Asked Questions`,
    find: () => ({ length: 0, filter: () => ({ length: 0 }) }),
    first: () => ({ text: () => '' }),
  });
  fn.html = () => '<html></html>';
  return fn;
}
doc.$root = { find: () => ({ length: 0, filter: () => ({ length: 0, get: () => null }) }) };

const issues = [
  ...casingRules(doc),
  ...numberRules(doc),
  ...metaRules(doc),
  ...technicalRules(doc, { sitemapUrls: [] }),
  ...structureRules(doc),
].filter((i) => i.severity !== 'info');

const byRule = new Map();
for (const i of issues) byRule.set(i.ruleId, (byRule.get(i.ruleId) || 0) + 1);

console.log(`\n${issues.length} findings on the stub page\n`);
for (const i of issues) {
  console.log(`[${i.severity.toUpperCase().padEnd(4)}] ${i.ruleId.padEnd(12)} ${i.title}`);
  console.log(`         found:    ${String(i.found).slice(0, 140)}`);
  if (i.expected) console.log(`         expected: ${String(i.expected).slice(0, 140)}`);
  console.log('');
}

// Every defect below is one I confirmed by hand on the live page or by
// arithmetic. If a rule stops firing, the checker has regressed.
const EXPECTED_RULES = [
  'CASE-08',    // "in U.S.?" should be "in the U.S."
  'META-02',    // title reads "Growth,2033" with no space after the comma
  'NUM-09',     // "is expected to reach … in 2025" on an already-measured base year
  'STRUCT-08',  // country report labelled "Regional Analysis" / "By Region"
  'STRUCT-10',  // segmentation bullets mix bold and plain lead-ins
  'TECH-06',    // double space in the subtitle before the year range
  'TECH-11',    // no reviewer credited in the meta bar
];

// Rules that must stay silent. A checker that cries wolf gets switched off, so
// the false-positive guards are tested as explicitly as the detections.
const MUST_NOT_FIRE = [
  'NUM-03',     // segment figures are not headline totals
  'NUM-02',     // 343.3 → 1,251.9 over 8 years really is 17.55%
  'STRUCT-04',  // the section order on this page is correct
];
const missing = EXPECTED_RULES.filter((r) => !byRule.has(r));
const spurious = MUST_NOT_FIRE.filter((r) => byRule.has(r));

console.log('Rules fired:', [...byRule.keys()].sort().join(', '));

if (missing.length) {
  console.error('\nFAIL — these rules should have fired and did not:', missing.join(', '));
}
if (spurious.length) {
  console.error('\nFAIL — these rules fired on correct content:', spurious.join(', '));
}
if (missing.length || spurious.length) process.exit(1);

console.log('\nPASS — every known defect caught, no false positives.');
