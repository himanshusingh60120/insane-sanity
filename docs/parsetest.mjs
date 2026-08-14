/**
 * End-to-end parser test. Feeds a synthetic report page through the real
 * cheerio parser and the offline rule modules, so parse.js is exercised rather
 * than stubbed.
 *
 *   node docs/parsetest.mjs
 *
 * The fixture deliberately contains an ALL CAPS table header and a heading that
 * is upper-cased by CSS rather than by content, because telling those two apart
 * is the whole reason this tool exists.
 */

import { parsePage } from '../lib/parse.js';
import casingRules from '../lib/rules/casing.js';
import structureRules from '../lib/rules/structure.js';
import technicalRules from '../lib/rules/technical.js';
import typographyRules from '../lib/rules/typography.js';

const CSS = `
  .sticky-title { text-transform: uppercase; letter-spacing: .04em; }
  .report-body h2 { font-weight: 600; }
`;

const HTML = `<!doctype html>
<html lang="en">
<head>
  <title>U.S. Widget Market Size &amp; Growth,2033 | Kings Research</title>
  <link rel="canonical" href="https://www.kingsresearch.com/report/us-widget-market-9001">
  <meta name="description" content="U.S. widget market to reach USD 900.0 million by 2033, a 12.00% CAGR from USD 363.5 million in 2025.">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body>
  <header>
    <div class="sticky-title">U.S. Widget Market</div>
  </header>
  <main class="report-body">
    <h1>U.S. Widget Market</h1>
    <h2>U.S. Widget Market Size, Share, Growth &amp; Industry Analysis, By Type, and Country Analysis,  2026 - 2033</h2>
    <p>Pages:150</p><p>Base Year:2025</p><p>Author:Test Analyst</p>

    <h2>Market Definition</h2>
    <p>The U.S. widget market covers the manufacture and distribution of widgets across industrial and consumer applications, including the tooling and services that support them.</p>

    <h2>U.S. Widget Market Overview</h2>
    <p>The U.S. widget industry was valued at USD 363.5 million in 2025 and is projected to reach USD 900.0 million by 2033, exhibiting a CAGR of 12.00% during the forecast period.</p>

    <h3>KEY MARKET HIGHLIGHTS</h3>
    <ol><li>The U.S. widget market size was valued at USD 363.5 million in 2025.</li></ol>

    <h2>How is automation driving the growth of the widget market?</h2>
    <p>Automation is lowering unit costs across the sector and pulling new buyers into the category.</p>
    <h2>How is raw material cost hindering the growth of the widget market?</h2>
    <p>Input prices remain volatile, which compresses margins for smaller manufacturers.</p>
    <h2>How is AI influencing the future of the widget market?</h2>
    <p>Predictive maintenance is becoming a standard feature of connected widget fleets.</p>

    <h2>U.S. Widget Market Report Snapshot</h2>
    <table>
      <tr><th>SEGMENTATION</th><th>DETAILS</th></tr>
      <tr><td>By Type</td><td>Rotary, Linear, Others</td></tr>
      <tr><td>By Region</td><td>U.S.</td></tr>
    </table>

    <h3>Market Segmentation</h3>
    <ul>
      <li><strong>By Type (Rotary, Linear, and Others):</strong> The rotary segment held a 55.00% share in 2025.</li>
      <li>By Application (Industrial and Consumer): The industrial segment earned USD 210.0 million in 2025.</li>
    </ul>

    <h2>What is the market scenario of widgets in U.S.?</h2>
    <p>Adoption is broadening from early industrial buyers toward mainstream commercial deployment.</p>

    <h3 class="sticky-title">Regulatory Frameworks</h3>
    <ul><li>The U.S. Consumer Product Safety Commission governs widget labelling requirements.</li></ul>

    <p>…the purity and stability of the product are valued.&nbsp;</p>
    <p>Furthermore, the regional market benefits from continuous product development.</p>
    <p>A sentence with a genuine  double space inside it.</p>
    <p style="font-size:11.0pt;font-family:Calibri,sans-serif">Pasted straight out of Word.</p>
    <p class="MsoNormal">Another paste artifact.</p>

    <h2>Competitive Landscape</h2>
    <p>The market remains moderately consolidated, with several mid-sized manufacturers expanding capacity.</p>
    <h3>Key Companies In The U.S. Widget Market</h3>
    <ul><li>Acme Widgets</li><li>Widget Co.</li><li>Rotary Industries</li></ul>
    <h3>Recent Developments</h3>
    <ul><li>In March 2026, Acme Widgets opened a second plant.</li></ul>

    <p>Frequently Asked Questions</p>
  </main>
</body>
</html>`;

const doc = parsePage({
  url: 'https://www.kingsresearch.com/report/us-widget-market-9001',
  html: HTML,
  css: CSS,
  status: 200,
  ttfbMs: 400,
});

console.log('\n── Parser output ──────────────────────────────────────────');
console.log('H1:          ', doc.h1);
console.log('Page type:   ', doc.pageType);
console.log('Template:    ', doc.template, '(expected A)');
console.log('Scope:       ', doc.scope, doc.country, '(expected country U.S.)');
console.log('Report id:   ', doc.reportId, '(expected 9001)');
console.log('Base year:   ', doc.metaBar.baseYear, '(expected 2025)');
console.log('Headings:    ', doc.headings.length);
console.log('Tables:      ', doc.tables.length, '· header cells:', JSON.stringify(doc.tables[0]?.headerCells));
console.log('Subtitle raw double space:', /\S {2}\S/.test(doc.subtitleRaw));
console.log('CSS-uppercased headings:  ', doc.headings.filter((h) => h.cssUppercase).length);

const issues = [
  ...casingRules(doc),
  ...structureRules(doc),
  ...technicalRules(doc, { sitemapUrls: [] }),
  ...typographyRules(doc),
].filter((i) => i.severity !== 'info');

console.log('\n── Findings ───────────────────────────────────────────────');
for (const i of issues) {
  console.log(`[${i.severity.toUpperCase().padEnd(4)}] ${i.ruleId.padEnd(11)} ${i.title}`);
  console.log(`         ${String(i.found).slice(0, 120)}`);
}

const fired = new Set(issues.map((i) => i.ruleId));

// Observations must never reach the issue stream — they are not defects and a
// QA tool that reports them as such is inventing work.
// Title Case with capitalised minor words is house style. Only a heading that
// is entirely shouting is a defect, and that is CASE-01's job.
const mustBeSilent = ['TECH-15', 'LINK-01', 'CASE-04', 'CASE-05'];
const noisy = mustBeSilent.filter((r) => fired.has(r));
const need = [
  ['CASE-01', 'ALL CAPS H3 in the source'],
  ['CASE-03', 'ALL CAPS table header cells'],
  ['CASE-08', '"in U.S.?" missing the article'],
  ['STRUCT-08', '"By Region" on a country report'],
  ['STRUCT-10', 'mixed bold segmentation bullets'],
  ['CASE-02', 'heading uppercased by CSS, not by content'],
  ['TECH-06', 'genuine double space inside one sentence'],
  ['TYPO-01', 'inline font-size / font-family on body copy'],
  ['TYPO-04', 'MsoNormal paste-artifact class'],
];
const missing = need.filter(([r]) => !fired.has(r));

// The regression that matters most: a paragraph boundary must never read as a
// double space. Two blocks, the first ending in &nbsp;, flatten into a string
// containing two spaces that exist nowhere in the copy.
const tech06 = issues.filter((i) => i.ruleId === 'TECH-06');
const falsePositive = tech06.some((i) => /are valued/.test(String(i.found)));

console.log('\n── Whitespace regression ──────────────────────────────────');
console.log('TECH-06 findings:', tech06.length);
for (const i of tech06) console.log('   ', String(i.found).replace(/\n/g, ' | '));
console.log('flags the paragraph boundary (must be false):', falsePositive);

console.log('\n── Result ─────────────────────────────────────────────────');
if (noisy.length) {
  console.error('FAIL — these are observations and must not appear as findings:', noisy.join(', '));
  process.exit(1);
}
if (falsePositive) {
  console.error('FAIL — TECH-06 still reads a paragraph boundary as a double space.');
  process.exit(1);
}
if (missing.length) {
  console.error('FAIL — not caught:', missing.map(([r, d]) => `${r} (${d})`).join(', '));
  process.exit(1);
}
console.log('PASS — parser and casing/structure rules agree on all six planted defects.');
