import { norm } from '../util.js';

/**
 * Section blueprints derived from four live reports:
 *   Template A — 3124 (spatial biology), 3129 (organ-on-a-chip), 3143 (tea extract)
 *   Template B — 3148 (ASIC), and the newer "Strategic Market Intelligence" titles
 *
 * `severity` is set by how much evidence there actually is, not by how important
 * a section feels. Only sections observed on *every* peer report of that
 * template fail the page; anything seen on some but not all is a warning.
 *
 * The reason for that discipline: reports in the wild are not cleanly A or B.
 * The cleaning-services report opens with Market Overview like a B, then carries
 * Key Market Highlights and a Snapshot like an A. Hard-coding a blueprint as
 * gospel turns every hybrid into a wall of red, and a checker that cries wolf
 * gets switched off. BASE-01, which compares against the reports actually
 * published alongside this one, is the rule that should carry the real weight.
 *
 * `scope: 'document'` searches the whole page rather than the editorial body,
 * for sections that live in the sidebar rail on some templates.
 */
export const BLUEPRINTS = {
  A: [
    { key: 'definition', label: 'Market Definition', test: /^market definition$/i, severity: 'warn' },
    { key: 'overview', label: '<Market> Overview', test: /overview$/i, severity: 'fail' },
    { key: 'highlights', label: 'Key Market Highlights', test: /^key market highlights:?$/i, severity: 'warn' },
    { key: 'driver', label: 'Driver question (H2 ending in ?)', test: /\?$/, severity: 'fail', min: 3 },
    { key: 'snapshot', label: '<Market> Snapshot', test: /\bsnapshot$/i, severity: 'fail' },
    { key: 'segmentation', label: 'Market Segmentation', test: /^market segmentation$/i, severity: 'fail' },
    { key: 'scenario', label: 'Market scenario / regional analysis', test: /market scenario/i, severity: 'warn' },
    { key: 'regulatory', label: 'Regulatory Frameworks', test: /^regulatory frameworks:?$/i, severity: 'warn' },
    { key: 'competitive', label: 'Competitive Landscape', test: /^competitive landscape$/i, severity: 'fail' },
    { key: 'companies', label: 'Key Companies in the <Market>', test: /^key companies/i, severity: 'warn' },
    { key: 'developments', label: 'Recent Developments', test: /^recent developments:?$/i, severity: 'warn' },
  ],
  B: [
    { key: 'overview', label: 'Market Overview', test: /^market overview$/i, severity: 'fail' },
    { key: 'segmentation', label: 'Market Segmentation', test: /^market segmentation$/i, severity: 'warn' },
    { key: 'driver', label: 'Analysis question (H2 ending in ?)', test: /\?$/, severity: 'fail', min: 3 },
    // "Customization Offered" is a sidebar widget on every report page and
    // "Customization Options for the … Report" is a body H2 on some. Either
    // satisfies this, and it is a warning because only one of the four reports
    // compared carried the body heading.
    {
      key: 'customisation',
      label: 'Customization Options',
      test: /customi[sz]ation\s+(options|offered)/i,
      severity: 'warn',
      scope: 'document',
    },
  ],
};

export default function structureRules(doc) {
  const issues = [];
  const headings = doc.headings;
  const h2s = headings.filter((h) => h.level === 2);

  // ── STRUCT-01 · exactly one H1 ──────────────────────────────────────────────
  const h1Count = doc.$('h1').length;
  if (h1Count !== 1) {
    issues.push({
      ruleId: 'STRUCT-01',
      category: 'Structure',
      severity: 'fail',
      items: ['M14'],
      title: h1Count === 0 ? 'Page has no H1' : `Page has ${h1Count} H1 tags`,
      where: 'Document',
      found: `${h1Count} × <h1>`,
      expected: 'Exactly one H1, carrying the market name',
      fix: h1Count === 0 ? 'Add an H1 with the market name.' : 'Demote the extra H1 tags to H2.',
    });
  }

  // ── STRUCT-02 · no skipped heading levels ───────────────────────────────────
  let previous = 1;
  for (const h of headings) {
    if (h.level > previous + 1) {
      issues.push({
        ruleId: 'STRUCT-02',
        category: 'Structure',
        severity: 'fail',
        items: ['M14'],
        title: `Heading level jumps from H${previous} to H${h.level}`,
        where: `${h.tag.toUpperCase()} · “${h.text}”`,
        found: `H${previous} → H${h.level}`,
        expected: `H${previous} → H${previous + 1}`,
        fix: `Change “${h.text}” to an H${previous + 1}.`,
      });
    }
    previous = h.level;
  }

  // ── STRUCT-03 · required sections for the detected template ─────────────────
  const blueprint = BLUEPRINTS[doc.template];
  if (!blueprint) {
    issues.push({
      ruleId: 'STRUCT-03',
      category: 'Structure',
      severity: 'fail',
      items: ['M15', 'R26'],
      title: 'Report template could not be identified',
      where: 'Document',
      found: `H2s found: ${h2s.map((h) => h.text).slice(0, 8).join(' | ') || 'none'}`,
      expected: 'Template A (Market Definition …) or Template B (Market Overview … Customization Options)',
      fix: 'The page does not match either published layout. Check it was built from the right template.',
    });
  } else {
    const found = {};
    for (const section of blueprint) {
      let matches = headings.filter((h) => h.level <= 3 && section.test.test(h.text));

      // Some sections live in the sidebar rail rather than the editorial body.
      let foundInChrome = false;
      if (!matches.length && section.scope === 'document') {
        foundInChrome = section.test.test(norm(doc.$('body').text()));
      }

      found[section.key] = matches;
      const need = section.min || 1;
      if (matches.length >= need || foundInChrome) continue;

      issues.push({
        ruleId: 'STRUCT-03',
        category: 'Structure',
        severity: section.severity || 'warn',
        items: sectionItems(section.key),
        title: `Missing section: ${section.label}`,
        where: `Template ${doc.template}`,
        found: matches.length ? `${matches.length} found, ${need} expected` : 'not present',
        expected: `${need} × “${section.label}”`,
        fix:
          section.severity === 'fail'
            ? `Add the “${section.label}” section. Every Template ${doc.template} report compared has it.`
            : `“${section.label}” appears on some Template ${doc.template} reports but not all, so this is worth a look rather than a blocker. Confirm it was meant to be omitted.`,
      });
    }

    // ── STRUCT-04 · section order matches the blueprint ────────────────────────
    const order = blueprint
      .filter((s) => found[s.key] && found[s.key].length && s.key !== 'driver')
      .map((s) => ({ key: s.key, label: s.label, index: headings.indexOf(found[s.key][0]) }));
    for (let i = 1; i < order.length; i += 1) {
      if (order[i].index < order[i - 1].index) {
        issues.push({
          ruleId: 'STRUCT-04',
          category: 'Structure',
          severity: 'warn',
          items: ['M15'],
          title: 'Sections appear out of the standard order',
          where: 'Document',
          found: `“${order[i].label}” comes before “${order[i - 1].label}”`,
          expected: blueprint.map((s) => s.label).join(' → '),
          fix: `Move “${order[i].label}” below “${order[i - 1].label}”.`,
        });
        break;
      }
    }
  }

  // ── STRUCT-05 · snapshot heading must carry the full market name ────────────
  // Baseline miss: 3129 H1 is “U.S. Organ-on-a-Chip Market” but the snapshot
  // heading reads “Organ-on-a-Chip Market Report Snapshot” — the country is gone.
  // Both "<Market> Report Snapshot" and "<Market> Snapshot" are in use, so this
  // checks that the market name is carried, not that the wording matches
  // character for character. The defect worth catching is a snapshot heading
  // that silently drops the country — 3129's H1 reads "U.S. Organ-on-a-Chip
  // Market" while its snapshot heading reads "Organ-on-a-Chip Market Snapshot".
  const snapshot = headings.find((h) => /\bsnapshot$/i.test(h.text));
  if (snapshot && doc.h1) {
    const head = norm(snapshot.text).toLowerCase();
    const missing = doc.h1
      .split(/\s+/)
      .filter((w) => w.length > 1 && !/^(the|and|of|for|market)$/i.test(w))
      .filter((w) => !head.includes(w.toLowerCase()));
    if (missing.length) {
      issues.push({
        ruleId: 'STRUCT-05',
        category: 'Structure',
        severity: 'fail',
        items: ['F10', 'M01'],
        title: 'Snapshot heading drops part of the H1 market name',
        where: 'Snapshot heading',
        found: `${snapshot.text} — missing: ${missing.join(', ')}`,
        expected: `${doc.h1} Snapshot`,
        fix: `Rename to “${doc.h1} Snapshot” so the snapshot cannot be mistaken for a different report.`,
      });
    }
  }

  // ── STRUCT-06 · overview heading must match the H1 ──────────────────────────
  const overview = headings.find((h) => /overview$/i.test(h.text) && h.level === 2);
  if (overview && doc.h1) {
    const expected = `${doc.h1} Overview`;
    if (norm(overview.text).toLowerCase() !== expected.toLowerCase()) {
      issues.push({
        ruleId: 'STRUCT-06',
        category: 'Structure',
        severity: 'warn',
        items: ['R27'],
        title: 'Overview heading does not match the H1 market name',
        where: 'H2 · Overview',
        found: overview.text,
        expected,
        fix: `Rename to “${expected}”.`,
      });
    }
  }

  // ── STRUCT-07 · subtitle must open with the H1 market name ──────────────────
  if (doc.subtitle && doc.h1 && !doc.subtitle.toLowerCase().startsWith(doc.h1.toLowerCase())) {
    issues.push({
      ruleId: 'STRUCT-07',
      category: 'Structure',
      severity: 'fail',
      items: ['M01', 'F10'],
      title: 'Report subtitle does not open with the H1 market name',
      where: 'H2 · subtitle under the H1',
      found: doc.subtitle.slice(0, 120),
      expected: `${doc.h1} Size, Share, Growth & Industry Analysis, …`,
      fix: `Prefix the subtitle with “${doc.h1}”.`,
    });
  }

  // ── STRUCT-08 · country reports must say “Country Analysis” ─────────────────
  // Baseline: 3129 and 3148 (both country reports) say “Country Analysis” and
  // “By Country”. 3124 is also a country report but says “Regional Analysis”
  // and “By Region”.
  if (doc.scope === 'country') {
    if (/regional analysis/i.test(doc.subtitle)) {
      issues.push({
        ruleId: 'STRUCT-08',
        category: 'Structure',
        severity: 'fail',
        items: ['F9', 'M01'],
        title: 'Country-level report is labelled “Regional Analysis”',
        where: 'H2 · subtitle',
        found: doc.subtitle.match(/[^,]*regional analysis[^,]*/i)?.[0] || 'Regional Analysis',
        expected: 'Country Analysis',
        fix: 'Replace “Regional Analysis” with “Country Analysis” — the report covers a single country.',
      });
    }
    const snapshotTable = doc.tables.find((t) => t.rows.some((r) => /^by\s/i.test(r[0] || '')));
    const byRegionRow = snapshotTable?.rows.find((r) => /^by region$/i.test(r[0] || ''));
    if (byRegionRow) {
      issues.push({
        ruleId: 'STRUCT-08',
        category: 'Structure',
        severity: 'fail',
        items: ['F9', 'R32'],
        title: 'Snapshot table uses “By Region” on a single-country report',
        where: 'Report Snapshot table',
        found: `By Region → ${byRegionRow[1] || ''}`,
        expected: `By Country → ${doc.country || 'U.S.'}`,
        fix: 'Rename the row to “By Country”.',
      });
    }
  }

  // ── STRUCT-09 · snapshot must be a real table, not a bullet list ────────────
  // Baseline miss: 3143 renders its snapshot as a <ul>, every other report uses
  // a <table>. It reads fine to a human and breaks every downstream scrape.
  if (snapshot) {
    const nextTable = doc.$root.find('table').length;
    const snapshotIsList = !doc.tables.some((t) =>
      t.rows.some((r) => /^by\s/i.test(r[0] || ''))
    );
    if (snapshotIsList) {
      issues.push({
        ruleId: 'STRUCT-09',
        category: 'Structure',
        severity: 'warn',
        items: ['R32', 'F11'],
        title: 'Report Snapshot is not marked up as a table',
        where: 'Report Snapshot section',
        found: nextTable ? 'a table exists but has no “By …” rows' : 'rendered as a bullet list',
        expected: '<table> with a Segmentation / Details header row',
        fix: 'Rebuild the snapshot as a table. A bullet list looks similar but loses the row structure.',
      });
    }
  }

  // ── STRUCT-10 · segmentation bullet lead-in style ───────────────────────────
  // Baseline: 3129 bolds “By Chip Type (…):”, 3124 and 3143 do not. Mixed within
  // a single page is always wrong; the tool reports the split.
  const segBullets = doc.paragraphs.filter((p) => p.tag === 'li' && /^by\s+[a-z]/i.test(p.text));
  if (segBullets.length >= 2) {
    const bolded = segBullets.filter((p) => p.boldLead).length;
    if (bolded > 0 && bolded < segBullets.length) {
      issues.push({
        ruleId: 'STRUCT-10',
        category: 'Formatting',
        severity: 'warn',
        items: ['F11'],
        title: 'Segmentation bullets mix bold and plain lead-ins',
        where: 'Market Segmentation list',
        found: `${bolded} of ${segBullets.length} bullets bold the “By …” lead-in`,
        expected: 'All bullets styled the same way',
        fix: 'Pick one: bold every “By …:” lead-in, or none of them.',
      });
    }
  }

  // ── STRUCT-11 · key companies list length ───────────────────────────────────
  const companiesHeading = headings.find((h) => /^key companies/i.test(h.text));
  if (companiesHeading) {
    const list = doc.$root.find('ul').filter((_, el) => {
      const items = doc.$(el).find('li');
      return items.length >= 5 && items.first().text().length < 60;
    });
    const count = list.length ? doc.$(list.get(list.length - 1)).find('li').length : 0;
    if (count && count < 10) {
      issues.push({
        ruleId: 'STRUCT-11',
        category: 'Structure',
        severity: 'warn',
        items: ['R30'],
        title: 'Key companies list is shorter than the house minimum',
        where: 'Key Companies section',
        found: `${count} companies`,
        expected: 'At least 10',
        fix: 'Published reports list 15 companies. Extend the list.',
      });
    }
  }

  // ── STRUCT-12 · FAQ block present ───────────────────────────────────────────
  if (!/frequently asked questions/i.test(doc.$('body').text())) {
    issues.push({
      ruleId: 'STRUCT-12',
      category: 'Structure',
      severity: 'fail',
      items: ['M15'],
      title: 'FAQ block is missing',
      where: 'Document',
      found: 'no “Frequently Asked Questions” block',
      expected: 'FAQ block with 6–11 questions',
      fix: 'Add the FAQ block; every published report carries one.',
    });
  }

  return issues;
}

function sectionItems(key) {
  const map = {
    definition: ['R26'],
    overview: ['R27'],
    highlights: ['R26'],
    driver: ['R28'],
    snapshot: ['R32'],
    segmentation: ['R32'],
    scenario: ['R29'],
    regulatory: ['M15'],
    competitive: ['R30'],
    companies: ['R30'],
    developments: ['M15'],
    customisation: ['M15'],
  };
  return map[key] || ['M15'];
}
