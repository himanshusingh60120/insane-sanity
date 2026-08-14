import { norm, context } from './util.js';

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
1. Every finding must include "quote": a span copied CHARACTER FOR CHARACTER from the supplied text, between 3 and 120 characters. Do not normalise spacing, quotes or capitalisation. Do not paraphrase.
2. If you cannot copy the exact span, do not report the finding.
3. "type" must be one of: spelling, grammar, tone.
4. "fix" must be the corrected version of the quoted span only.
5. Proper nouns, company names, tickers, scientific terms and unit abbreviations are not spelling errors. Ignore them.
6. British vs American spelling is not an error unless the page mixes both; if it mixes both, report the minority spelling.
7. Do not comment on facts, figures, structure or formatting. Other systems handle those.
8. If the text is clean, return an empty findings array.

Return JSON only: {"findings":[{"type":"spelling","quote":"...","fix":"...","note":"..."}]}`;

export async function runAiPass({ text, model, apiKey, maxChars = 14000 }) {
  if (!apiKey) {
    return { available: false, findings: [], discarded: 0, reason: 'OPENAI_API_KEY not set' };
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

  const raw = Array.isArray(parsed.findings) ? parsed.findings : [];
  const verified = [];
  let discarded = 0;

  for (const f of raw) {
    const quote = typeof f.quote === 'string' ? f.quote : '';
    const type = ['spelling', 'grammar', 'tone'].includes(f.type) ? f.type : null;
    if (!quote || quote.length < 3 || quote.length > 200 || !type) {
      discarded += 1;
      continue;
    }
    // The verification step. Exact substring or nothing.
    if (!excerpt.includes(quote)) {
      discarded += 1;
      continue;
    }
    // A "fix" identical to the quote means the model found nothing to change.
    if (typeof f.fix === 'string' && norm(f.fix) === norm(quote)) {
      discarded += 1;
      continue;
    }
    verified.push({
      type,
      quote,
      fix: typeof f.fix === 'string' ? f.fix : '',
      note: typeof f.note === 'string' ? f.note.slice(0, 200) : '',
      context: context(excerpt, quote, 45),
    });
  }

  return { available: true, findings: verified, discarded, proposed: raw.length, model: model || 'gpt-4o-mini' };
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
