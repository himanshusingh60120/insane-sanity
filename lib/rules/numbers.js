import { norm, parseMoneyToMillions, cagr, round, context, unique } from '../util.js';

const MONEY = /(?:USD|US\$|\$)\s*[\d,]+(?:\.\d+)?\s*(?:million|billion|trillion|M\b|B\b|T\b)?/gi;
const PERCENT = /\d+(?:\.\d+)?\s*%/g;
const CAGR_NEAR = /CAGR[^.]{0,60}?(\d+(?:\.\d+)?)\s*%|(\d+(?:\.\d+)?)\s*%[^.]{0,40}?CAGR/gi;

/** Every distinct CAGR figure quoted on the page, with a snippet for evidence. */
function collectCagrs(text) {
  const out = [];
  for (const m of text.matchAll(CAGR_NEAR)) {
    const value = parseFloat(m[1] || m[2]);
    if (Number.isFinite(value)) out.push({ value, snippet: norm(m[0]) });
  }
  return out;
}

/** Money figures tied to the year mentioned in the same clause. */
function collectFigures(text) {
  const out = [];
  const sentences = text.split(/(?<=[.!?])\s+/);
  for (const s of sentences) {
    for (const m of s.matchAll(MONEY)) {
      const millions = parseMoneyToMillions(m[0]);
      if (millions == null) continue;
      const after = s.slice(m.index + m[0].length, m.index + m[0].length + 40);
      const before = s.slice(Math.max(0, m.index - 40), m.index);
      const year = (after.match(/\b(20\d{2})\b/) || before.match(/\b(20\d{2})\b/) || [])[1];
      out.push({
        raw: norm(m[0]),
        millions,
        year: year ? Number(year) : null,
        sentence: norm(s),
        // A figure attributed to a segment or a region is not the headline
        // total and must never be cross-checked against it. Without this the
        // rule fires on correct pages, because the highlights list segment
        // values for the same forecast year as the total.
        isPartial: /\bsegment\b|\bshare\b|\bregion(al)?\b|Asia|Europe|North America/i.test(s),
      });
    }
  }
  return out;
}

export default function numberRules(doc) {
  const issues = [];
  const text = doc.text;
  const metaDesc = doc.meta['description'] || '';

  const baseYear = Number(doc.metaBar.baseYear) || null;
  const forecastRange = (doc.subtitle.match(/(20\d{2})\s*[-–—]\s*(20\d{2})/) || []).slice(1).map(Number);
  const [forecastStart, forecastEnd] = forecastRange.length === 2 ? forecastRange : [null, null];

  const figures = collectFigures(text);
  const cagrs = collectCagrs(text);
  const cagrValues = unique(cagrs.map((c) => c.value));

  // ── NUM-01 · one headline CAGR, quoted identically everywhere ───────────────
  // The headline CAGR is the one that appears most often; segment CAGRs are
  // legitimately different, so only the headline is cross-checked.
  const counts = new Map();
  cagrs.forEach((c) => counts.set(c.value, (counts.get(c.value) || 0) + 1));
  const headlineCagr = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const metaCagr = parseFloat((metaDesc.match(/(\d+(?:\.\d+)?)\s*%\s*CAGR/i) || metaDesc.match(/CAGR[^.]{0,30}?(\d+(?:\.\d+)?)\s*%/i) || [])[1]);
  if (headlineCagr != null && Number.isFinite(metaCagr) && Math.abs(metaCagr - headlineCagr) > 0.001) {
    issues.push({
      ruleId: 'NUM-01',
      category: 'Content Accuracy',
      severity: 'fail',
      items: ['M08', 'M04'],
      title: 'Meta description CAGR does not match the body CAGR',
      where: 'meta[name=description] vs body',
      found: `meta: ${metaCagr}% · body: ${headlineCagr}%`,
      expected: 'Same figure in both',
      fix: `Set the meta description CAGR to ${headlineCagr}% (or correct the body).`,
    });
  }

  // ── NUM-02 · recompute the CAGR from the quoted start and end values ────────
  // This is the rule that catches an arithmetic slip that reads perfectly well.
  const endYear = forecastEnd || 2033;
  const headline = figures.filter((f) => !f.isPartial);
  const endFigure = headline
    .filter((f) => f.year === endYear)
    .sort((a, b) => b.millions - a.millions)[0];
  const baseFigure = baseYear
    ? headline.filter((f) => f.year === baseYear).sort((a, b) => b.millions - a.millions)[0]
    : null;
  const startFigure = forecastStart
    ? headline.filter((f) => f.year === forecastStart).sort((a, b) => b.millions - a.millions)[0]
    : null;

  if (headlineCagr != null && endFigure && (baseFigure || startFigure)) {
    const candidates = [];
    if (baseFigure) {
      candidates.push({
        label: `${baseYear}→${endYear} (${endYear - baseYear} yr)`,
        value: cagr(baseFigure.millions, endFigure.millions, endYear - baseYear),
        from: baseFigure,
      });
    }
    if (startFigure && startFigure !== baseFigure) {
      candidates.push({
        label: `${forecastStart}→${endYear} (${endYear - forecastStart} yr)`,
        value: cagr(startFigure.millions, endFigure.millions, endYear - forecastStart),
        from: startFigure,
      });
    }
    const best = candidates
      .filter((c) => Number.isFinite(c.value))
      .sort((a, b) => Math.abs(a.value - headlineCagr) - Math.abs(b.value - headlineCagr))[0];

    if (best && Math.abs(best.value - headlineCagr) > 0.15) {
      issues.push({
        ruleId: 'NUM-02',
        category: 'Content Accuracy',
        severity: 'fail',
        items: ['M08', 'M07'],
        title: 'Stated CAGR does not follow from the stated market values',
        where: 'Overview / Key Market Highlights',
        found: `${headlineCagr}% stated · ${candidates
          .map((c) => `${c.label} implies ${round(c.value)}%`)
          .join(' · ')}`,
        expected: `${round(best.value)}% for the values on the page`,
        fix: `Either correct the CAGR to ${round(best.value)}%, or correct the ${endYear} value. From ${
          best.from.raw
        } at ${headlineCagr}%, ${endYear} would be USD ${round(
          best.from.millions * (1 + headlineCagr / 100) ** (endYear - (best.from.year || baseYear)),
          1
        )} million, not ${endFigure.raw}.`,
      });
    } else if (best) {
      // Passing, but record which anchor year the maths uses so the team can see
      // when a report silently switches convention.
      issues.push({
        ruleId: 'NUM-02-INFO',
        category: 'Content Accuracy',
        severity: 'info',
        items: [],
        title: 'CAGR arithmetic checks out',
        where: 'Overview',
        found: `${headlineCagr}% · anchored ${best.label}`,
        expected: '',
        fix: '',
      });
    }
  } else if (headlineCagr != null) {
    issues.push({
      ruleId: 'NUM-02',
      category: 'Content Accuracy',
      severity: 'warn',
      items: ['M08'],
      title: 'CAGR could not be verified — start or end value not found',
      where: 'Overview',
      found: `CAGR ${headlineCagr}% quoted; ${endFigure ? '' : `no ${endYear} value; `}${
        baseFigure || startFigure ? '' : 'no base-year value'
      }`,
      expected: 'Both a base-year and a forecast-year value in the overview paragraph',
      fix: 'State both values in the overview so the growth rate is checkable.',
    });
  }

  // ── NUM-03 · headline figures repeated identically across sections ──────────
  const sections = {
    'meta description': metaDesc,
    'Key Market Highlights': sliceAfter(text, /Key Market Highlights:?/i, 900),
    FAQ: sliceAfter(text, /Frequently Asked Questions/i, 900),
  };
  for (const [name, chunk] of Object.entries(sections)) {
    if (!chunk) continue;
    const chunkFigures = collectFigures(chunk).filter((f) => !f.isPartial);
    for (const anchor of [baseFigure, endFigure].filter(Boolean)) {
      const sameYear = chunkFigures.filter((f) => f.year === anchor.year);
      if (!sameYear.length) continue;
      const mismatch = sameYear.find((f) => Math.abs(f.millions - anchor.millions) > 0.05);
      if (mismatch && !sameYear.some((f) => Math.abs(f.millions - anchor.millions) <= 0.05)) {
        issues.push({
          ruleId: 'NUM-03',
          category: 'Content Accuracy',
          severity: 'fail',
          items: ['M07'],
          title: `${anchor.year} market size differs between the overview and the ${name}`,
          where: name,
          found: `overview: ${anchor.raw} · ${name}: ${mismatch.raw}`,
          expected: 'Identical figures',
          fix: `Align the ${name} to ${anchor.raw}.`,
        });
      }
    }
  }

  // ── NUM-04 · base year matches the meta bar ─────────────────────────────────
  if (baseYear && baseFigure == null && figures.length) {
    const years = unique(figures.map((f) => f.year).filter(Boolean)).sort();
    issues.push({
      ruleId: 'NUM-04',
      category: 'Content Accuracy',
      severity: 'fail',
      items: ['M10'],
      title: 'No market value is stated for the declared base year',
      where: 'Meta bar vs body',
      found: `Base Year: ${baseYear} · values found for ${years.join(', ') || 'no year'}`,
      expected: `A “USD … in ${baseYear}” figure in the overview`,
      fix: `Add the ${baseYear} value, or correct the Base Year field.`,
    });
  }

  // ── NUM-05 · forecast period stated consistently ────────────────────────────
  const ranges = unique(
    Array.from(text.matchAll(/\b(20\d{2})\s*[-–—]\s*(20\d{2})\b/g)).map((m) => `${m[1]}-${m[2]}`)
  );
  if (ranges.length > 1) {
    issues.push({
      ruleId: 'NUM-05',
      category: 'Content Accuracy',
      severity: 'fail',
      items: ['M09'],
      title: 'More than one forecast period appears on the page',
      where: 'Body copy',
      found: ranges.join(' · '),
      expected: 'One range, used everywhere',
      fix: `Standardise on ${forecastStart && forecastEnd ? `${forecastStart}-${forecastEnd}` : ranges[0]}.`,
    });
  }
  const dashStyles = unique(
    Array.from(text.matchAll(/\b20\d{2}(\s*[-–—]\s*)20\d{2}\b/g)).map((m) => JSON.stringify(m[1]))
  );
  if (dashStyles.length > 1) {
    issues.push({
      ruleId: 'NUM-05',
      category: 'Formatting',
      severity: 'warn',
      items: ['F8'],
      title: 'Year ranges use different dash and spacing styles',
      where: 'Body copy',
      found: dashStyles.map((d) => `2026${JSON.parse(d)}2033`).join('  vs  '),
      expected: 'One style throughout, e.g. 2026-2033',
      fix: 'Pick one dash style and apply it to every range including the subtitle and image alt text.',
    });
  }

  // ── NUM-06 · currency notation ──────────────────────────────────────────────
  const usesDollarSign = /(?:^|\s)\$\s?\d/.test(text) || /(?:^|\s)\$\s?\d/.test(metaDesc);
  const usesUsd = /USD\s*\d/.test(text);
  if (usesDollarSign && usesUsd) {
    issues.push({
      ruleId: 'NUM-06',
      category: 'Formatting',
      severity: 'fail',
      items: ['F7'],
      title: 'Currency written two ways on the same page',
      where: 'Body copy / meta description',
      found: `“$” and “USD” both used`,
      expected: '“USD 343.3 million” everywhere, including the meta description',
      fix: 'Replace every “$” with “USD ” and spell out million / billion.',
    });
  }
  const spacedDollar = text.match(/\$\s+\d/) || metaDesc.match(/\$\s+\d/);
  if (spacedDollar) {
    issues.push({
      ruleId: 'NUM-06',
      category: 'Formatting',
      severity: 'fail',
      items: ['F7'],
      title: 'Space between the currency symbol and the number',
      where: metaDesc.match(/\$\s+\d/) ? 'meta description' : 'body copy',
      found: spacedDollar[0],
      expected: 'USD 33.08 billion',
      fix: 'Remove the space and switch to the USD form.',
    });
  }
  const abbreviated = (metaDesc.match(/\d+(?:\.\d+)?\s*[MBT]\b/g) || []);
  if (abbreviated.length) {
    issues.push({
      ruleId: 'NUM-06',
      category: 'Formatting',
      severity: 'warn',
      items: ['F7', 'M04'],
      title: 'Meta description abbreviates the unit',
      where: 'meta[name=description]',
      found: abbreviated.join(', '),
      expected: 'million / billion spelled out',
      fix: 'Other reports spell the unit out in the meta description. Match them.',
    });
  }

  // ── NUM-07 · decimal places on the same percentage ──────────────────────────
  const pctSeen = new Map();
  for (const m of text.matchAll(PERCENT)) {
    const raw = norm(m[0]).replace(/\s+/g, '');
    const value = parseFloat(raw);
    if (!Number.isFinite(value)) continue;
    const key = value.toFixed(2);
    if (!pctSeen.has(key)) pctSeen.set(key, new Set());
    pctSeen.get(key).add(raw);
  }
  for (const [, forms] of pctSeen) {
    if (forms.size > 1) {
      const list = [...forms];
      issues.push({
        ruleId: 'NUM-07',
        category: 'Formatting',
        severity: 'fail',
        items: ['F8'],
        title: 'Same percentage written with different decimal places',
        where: 'Body copy',
        found: list.join('  vs  '),
        expected: 'Two decimal places throughout',
        fix: `Write it as ${list.sort((a, b) => b.length - a.length)[0]} in every place it appears.`,
      });
    }
  }

  // ── NUM-08 · thousands separators ───────────────────────────────────────────
  const bareThousands = text.match(/\b\d{4,}\.\d\b(?!\s*(?:-|–))/);
  if (bareThousands && !/20\d{2}/.test(bareThousands[0])) {
    issues.push({
      ruleId: 'NUM-08',
      category: 'Formatting',
      severity: 'warn',
      items: ['F8'],
      title: 'Large number written without a thousands separator',
      where: 'Body copy',
      found: bareThousands[0],
      expected: '1,251.9',
      fix: 'Add comma separators to four-digit-and-longer figures.',
    });
  }

  // ── NUM-09 · future tense on a historical year ──────────────────────────────
  // Baseline miss: “is expected to reach USD 158.3 million in revenue in 2025”
  // where 2025 is the base year and already measured.
  if (baseYear) {
    // The span between the verb and the year almost always contains a figure
    // like "USD 158.3 million", so the character class has to allow a period
    // when it is a decimal point while still refusing to cross a sentence end.
    const seg = '(?:[^.]|\\.(?=\\d))';
    const tense = new RegExp(
      `(?:is|are|will)\\s+(?:expected|projected|anticipated|estimated|likely|set)\\s+to\\s+` +
        `(?:reach|grow|register|witness|record|account)${seg}{0,80}?\\b${baseYear}\\b`,
      'i'
    );
    const hit = text.match(tense);
    if (hit) {
      issues.push({
        ruleId: 'NUM-09',
        category: 'Grammar',
        severity: 'fail',
        items: ['M12', 'M07'],
        title: 'Forward-looking wording used for the base year',
        where: 'Key Market Highlights / segmentation',
        found: context(text, hit[0], 20),
        expected: `Past tense for ${baseYear}, e.g. “garnered USD … in ${baseYear}”`,
        fix: `${baseYear} is the base year and already measured. Change “expected to reach” to “garnered” / “accounted for”.`,
      });
    }
  }

  // ── NUM-10 · segment shares above 100% ──────────────────────────────────────
  const shareClaims = Array.from(
    text.matchAll(/largest share of (\d+(?:\.\d+)?)\s*%|share of (\d+(?:\.\d+)?)\s*%/gi)
  ).map((m) => parseFloat(m[1] || m[2]));
  if (shareClaims.some((v) => v > 100)) {
    issues.push({
      ruleId: 'NUM-10',
      category: 'Content Accuracy',
      severity: 'fail',
      items: ['M07'],
      title: 'A stated market share exceeds 100%',
      where: 'Segmentation',
      found: shareClaims.filter((v) => v > 100).join(', '),
      expected: '0–100%',
      fix: 'Correct the share figure.',
    });
  }

  return issues;
}

function sliceAfter(text, pattern, length) {
  const m = text.match(pattern);
  if (!m) return '';
  return text.slice(m.index, m.index + length);
}
