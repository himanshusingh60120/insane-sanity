import { norm, context, similarity, quotedTokens } from './util.js';

/**
 * The only place a language model touches this tool.
 *
 * Three checklist rows genuinely need one — spelling, grammar and tone are not
 * regex problems. Everything else is decided by the deterministic rules and the
 * model never sees those verdicts.
 *
 * The anti-fabrication guard is mechanical, not a prompt instruction: the model
 * must return the exact text it is objecting to, and any finding whose `quote`
 * is not found byte-for-byte in the page source is dropped before it reaches the
 * UI or the sheet. A model that invents a sentence produces a quote that does
 * not exist, and the finding disappears. Dropped findings are counted and
 * reported so you can see when the model is drifting.
 */

const SYSTEM = `You are a copy-editor checking a market-research report page.
Report only errors you can point at in the supplied text.

Rules you must follow exactly:
1. Every finding must include "quote": a span copied CHARACTER FOR CHARACTER from the supplied text. Do not normalise spacing, quotes or capitalisation. Do not paraphrase.
1a. "quote" must be the SMALLEST span containing the error. For spelling, quote the misspelled word alone — never the sentence around it. For grammar, quote the shortest clause that has to change.
1b. "fix" must be a minimal edit of "quote". If your fix is not recognisably the same text with a small correction applied, you are reporting the wrong span — drop the finding.
2. If you cannot copy the exact span, do not report the finding.
3. "type" must be one of: spelling, grammar, tone.
4. "fix" must be the corrected version of the quoted span only.
5. Proper nouns, company names, tickers, scientific terms and unit abbreviations are not spelling errors. Ignore them.
6. British vs American spelling is not an error unless the page mixes both; if it mixes both, report the minority spelling.
7. Do not comment on facts, figures, structure or formatting. Other systems handle those.
8. If you name a specific word in "note", that exact word must appear in "quote".
9. If the text is clean, return an empty findings array.

Return JSON only: {"findings":[{"type":"spelling","quote":"...","fix":"...","note":"..."}]}`;

export async function runAiPass({ text, model, apiKey, maxChars = 14000 }) {
  if (!apiKey) {
    return { available: false, findings: [], discarded: 0, discardedReasons: [], reason: 'OPENAI_API_KEY not set' };
  }

  const excerpt = text.slice(0, maxChars);

  let payload;
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || 'gpt-4o-mini',
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: excerpt },
        ],
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      return { available: false, findings: [], discarded: 0, reason: `OpenAI ${res.status}: ${body.slice(0, 160)}` };
    }
    payload = await res.json();
  } catch (err) {
    return { available: false, findings: [], discarded: 0, reason: String(err.message || err) };
  }

  let parsed;
  try {
    parsed = JSON.parse(payload.choices?.[0]?.message?.content || '{}');
  } catch {
    return { available: false, findings: [], discarded: 0, reason: 'Model did not return valid JSON' };
  }

  const checked = verifyFindings(parsed.findings, excerpt);
  return { available: true, ...checked, model: model || 'gpt-4o-mini' };
}

/**
 * The verification layer, kept pure and exported so docs/aitest.mjs can prove
 * what it rejects without calling an API. Nothing reaches the UI or the sheet
 * without passing every guard below.
 */
export function verifyFindings(raw = [], source = '') {
  const verified = [];
  const discardedReasons = [];
  let discarded = 0;

  const drop = (reason, f) => {
    discarded += 1;
    discardedReasons.push(`${reason}: ${String(f.quote || f.note || '').slice(0, 60)}`);
  };

  for (const f of raw) {
    const quote = typeof f.quote === 'string' ? f.quote : '';
    const fix = typeof f.fix === 'string' ? f.fix : '';
    const note = typeof f.note === 'string' ? f.note : '';
    const type = ['spelling', 'grammar', 'tone'].includes(f.type) ? f.type : null;

    if (!quote || quote.length < 3 || quote.length > 160 || !type) {
      drop('malformed', f);
      continue;
    }

    // Guard 1 — the span must exist on the page, byte for byte.
    if (!source.includes(quote)) {
      drop('quote not found verbatim', f);
      continue;
    }

    // Guard 2 — a fix identical to the quote is not a finding.
    if (norm(fix) === norm(quote)) {
      drop('fix identical to quote', f);
      continue;
    }

    if (type !== 'tone') {
      if (!fix) {
        drop('no correction supplied', f);
        continue;
      }

      // Guard 3 — a spelling fix must quote a word or short phrase, not a
      // sentence. Quoting a whole clause is how a model smuggles an invented
      // claim past a verbatim check: the sentence is real, the error is not.
      if (type === 'spelling' && quote.trim().split(/\s+/).length > 8) {
        drop('spelling quote too long to be a single word error', f);
        continue;
      }

      // Guard 4 — the correction must be a plausible minimal edit of the text
      // it claims to correct. Replacing a 90-character clause with the single
      // word "suppliers" is not a correction, it is a different sentence.
      if (similarity(quote, fix) < 0.5) {
        drop(`fix not a minimal edit (similarity ${similarity(quote, fix).toFixed(2)})`, f);
        continue;
      }
    }

    // Guard 5 — any word the model quotes inside its own note must actually be
    // present in the span. A note reading "the word 'cer' is a typo" is
    // discarded outright when 'cer' appears nowhere in the quoted text.
    const claimed = quotedTokens(note).filter((t) => /^[\w'’-]+$/.test(t));
    const phantom = claimed.find(
      (t) => !new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(quote)
    );
    if (phantom) {
      drop(`claimed word “${phantom}” is not in the quoted text`, f);
      continue;
    }

    verified.push({
      type,
      quote,
      fix,
      note: note.slice(0, 200),
      context: context(source, quote, 45),
    });
  }

  return {
    findings: verified,
    discarded,
    discardedReasons: discardedReasons.slice(0, 8),
    proposed: raw.length,
  };
}

/** Turn verified findings into the same issue shape the deterministic rules use. */
export function aiFindingsToIssues(result) {
  const map = { spelling: 'M11', grammar: 'M12', tone: 'M13' };
  return result.findings.map((f) => ({
    ruleId: `AI-${f.type.toUpperCase()}`,
    category: 'Grammar',
    severity: f.type === 'tone' ? 'warn' : 'fail',
    items: [map[f.type]],
    title: `${f.type[0].toUpperCase()}${f.type.slice(1)}: ${f.note || 'flagged by copy-edit pass'}`,
    where: 'Body copy',
    found: f.context,
    expected: f.fix,
    fix: f.fix ? `Change “${f.quote}” to “${f.fix}”.` : `Review “${f.quote}”.`,
    verifiedBy: 'AI + verbatim match',
  }));
}
