/**
 * AI verification guard tests.
 *
 *   node docs/aitest.mjs
 *
 * Runs no network calls. It feeds fabricated model output straight through the
 * verification layer to prove which findings survive.
 *
 * Case 1 is the real one that got through: the model quoted a sentence that
 * genuinely exists on the cleaning-services page, then claimed the word 'cer'
 * in it was a typo for "suppliers". The quote was real, so a verbatim check
 * alone passed it. The word 'cer' appears nowhere, and "suppliers" is not a
 * minimal edit of a 90-character clause — either guard catches it.
 */

import { verifyFindings } from '../lib/ai.js';

const PAGE = `The rising emphasis on sustainable cleaning products and practices is shaping the cleaning services market. Market players are prioritizing solutions that reduce exposure to harsh chemicals, improve indoor air quality, and minimize waste and packaging. Consequently, this shift is accelerating demand for providers that utilize environmentally friendly practices and hold recognized green certifications. Sustainability credentials are emerging as a competitive differentiator and a critical procurement criterion for end users when shortlisting cleaning service providers. The compnay also reported strong demand. Their is a clear trend toward automation.`;

const PROPOSED = [
  {
    label: 'the real hallucination — sentence quoted, invented word claimed',
    finding: {
      type: 'spelling',
      quote:
        'friendly practices and hold recognized green certifications. Sustainability credentials are e',
      fix: 'suppliers',
      note: "The word 'cer' appears to be a typographical error.",
    },
    shouldSurvive: false,
  },
  {
    label: 'invented quote that is not on the page at all',
    finding: {
      type: 'spelling',
      quote: 'sustainabilty',
      fix: 'sustainability',
      note: 'Misspelling.',
      },
    shouldSurvive: false,
  },
  {
    label: 'genuine misspelling, minimal edit',
    finding: { type: 'spelling', quote: 'compnay', fix: 'company', note: 'Letters transposed.' },
    shouldSurvive: true,
  },
  {
    label: 'genuine grammar error, short clause',
    finding: { type: 'grammar', quote: 'Their is a clear trend', fix: 'There is a clear trend', note: 'Wrong homophone.' },
    shouldSurvive: true,
  },
  {
    label: 'fix identical to quote — no actual finding',
    finding: { type: 'spelling', quote: 'certifications', fix: 'certifications', note: 'Looks fine.' },
    shouldSurvive: false,
  },
  {
    label: 'whole sentence quoted for a spelling claim',
    finding: {
      type: 'spelling',
      quote: 'Market players are prioritizing solutions that reduce exposure to harsh chemicals',
      fix: 'Market players are prioritising solutions that reduce exposure to harsh chemicals',
      note: 'Spelling variant.',
    },
    shouldSurvive: false,
  },
];

const result = verifyFindings(PROPOSED.map((c) => c.finding), PAGE);
const survived = new Set(result.findings.map((f) => f.quote));

console.log('\n── AI verification guards ─────────────────────────────────\n');
let failures = 0;
for (const c of PROPOSED) {
  const kept = survived.has(c.finding.quote);
  const ok = kept === c.shouldSurvive;
  if (!ok) failures += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${kept ? 'kept    ' : 'rejected'}  ${c.label}`);
}

console.log('\nRejection reasons recorded:');
for (const r of result.discardedReasons) console.log('   ·', r);

console.log(`\n${result.findings.length} of ${PROPOSED.length} findings survived.`);
if (failures) {
  console.error(`\nFAIL — ${failures} case(s) behaved incorrectly.`);
  process.exit(1);
}
console.log('\nPASS — every fabricated finding was rejected, every real one kept.');
