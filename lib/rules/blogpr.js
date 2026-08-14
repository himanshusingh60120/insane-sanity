import { norm } from '../util.js';

/** Rules that only apply to /blog/ and /press-release/ pages. */
export default function blogPrRules(doc) {
  const issues = [];
  const text = doc.text;

  if (doc.pageType === 'blog') {
    const intro = doc.paragraphs[0]?.text || '';
    if (intro.length < 120) {
      issues.push(mk('BLOG-01', 'fail', ['B01'], 'Opening paragraph is too thin', 'First paragraph', `${intro.length} characters`, '150–400 characters', 'Open with a concrete hook, not a definition.'));
    }
    const h2s = doc.headings.filter((h) => h.level === 2);
    if (h2s.length < 3) {
      issues.push(mk('BLOG-02', 'fail', ['B05', 'B03'], 'Too few subheadings to scan', 'Body', `${h2s.length} H2s`, '3 or more', 'Break the post into scannable sections.'));
    }
    const longH2 = h2s.find((h) => h.text.length > 70);
    if (longH2) {
      issues.push(mk('BLOG-02', 'warn', ['B05'], 'Subheading is too long to scan', 'H2', longH2.text, 'Under 70 characters', 'Tighten the subheading.'));
    }
    if (!/\b(for (?:example|instance)|case study|such as)\b/i.test(text)) {
      issues.push(mk('BLOG-03', 'fail', ['B04'], 'No worked example or case reference', 'Body', 'no example markers found', 'At least one concrete example', 'Add a named example so the argument lands.'));
    }
    if (!doc.headings.some((h) => /conclusion|final thoughts|key takeaway|wrapping up/i.test(h.text))) {
      issues.push(mk('BLOG-04', 'fail', ['B06'], 'No conclusion section', 'Body', '(none)', 'A closing section', 'Add a short conclusion.'));
    }
    const cta = doc.links.some((l) => /\/report\/|\/report-store|\/connect|\/services/.test(l.href));
    if (!cta) {
      issues.push(mk('BLOG-05', 'fail', ['B07'], 'No call to action linking to a report or service', 'Body', '(none)', 'Link to a report, the store, or contact', 'Add the CTA link.'));
    }
  }

  if (doc.pageType === 'press-release') {
    const h1 = doc.h1;
    if (h1.length > 110) {
      issues.push(mk('PR-01', 'warn', ['P01'], 'Headline is long for a wire release', 'H1', `${h1.length} characters`, 'Under 100 characters', 'Tighten the headline.'));
    }
    const hasDate = /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+20\d{2}\b/.test(text) || Boolean(doc.metaBar.release);
    if (!hasDate) {
      issues.push(mk('PR-02', 'fail', ['P02'], 'No dateline', 'Body', '(none)', 'City, Month DD, YYYY', 'Add the release date.'));
    }
    const hasLocation = /\b(?:Las Vegas|New York|London|Dubai|Pune|NV|NY)\b/.test(text) || /—\s*[A-Z][a-z]+,/.test(text);
    if (!hasLocation) {
      issues.push(mk('PR-03', 'fail', ['P03'], 'No location in the dateline', 'Body', '(none)', 'City name before the date', 'Add the city.'));
    }
    const hasQuote = /[“"][^”"]{40,}[”"]\s*,?\s*(?:said|added|noted|commented)/i.test(doc.rawText) || /(?:said|commented)\s+[A-Z][a-z]+\s+[A-Z]/.test(text);
    if (!hasQuote) {
      issues.push(mk('PR-04', 'fail', ['P04'], 'No attributed spokesperson quote', 'Body', '(none)', 'A quoted sentence attributed by name and title', 'Add the quote — wire services expect one.'));
    }
    if (!/about kings research/i.test(text)) {
      issues.push(mk('PR-05', 'fail', ['P05'], 'No boilerplate company introduction', 'Body', '(none)', '“About Kings Research” paragraph', 'Add the standard boilerplate.'));
    }
    const hasContact = /business@kingsresearch\.com|\+1[- ]?888/.test(doc.$('body').text());
    if (!hasContact) {
      issues.push(mk('PR-06', 'fail', ['P06'], 'No media contact details', 'Body', '(none)', 'Email and phone', 'Add the media contact block.'));
    }
  }

  return issues;
}

function mk(ruleId, severity, items, title, where, found, expected, fix) {
  return { ruleId, category: 'Content Type', severity, items, title, where, found: norm(found), expected, fix };
}
