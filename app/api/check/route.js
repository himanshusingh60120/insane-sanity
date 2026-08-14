import { NextResponse } from 'next/server';
import { fetchPage, fetchSitemapUrls } from '../../../lib/fetchPage.js';
import { parsePage } from '../../../lib/parse.js';
import { runAllRules } from '../../../lib/rules/index.js';
import { runAiPass, aiFindingsToIssues } from '../../../lib/ai.js';
import { buildBaseline } from '../../../lib/baseline.js';
import { writeRun } from '../../../lib/sheets.js';
import { itemsForPageType } from '../../../lib/checklist.js';

export const runtime = 'nodejs';
export const maxDuration = 120;
export const dynamic = 'force-dynamic';

export async function POST(request) {
  const started = Date.now();

  const token = process.env.KR_ACCESS_TOKEN;
  if (token && request.headers.get('x-kr-token') !== token) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Send a JSON body with a url field.' }, { status: 400 });
  }

  const {
    url,
    checkedBy = '',
    writeToSheet = true,
    useAi = true,
    useBaseline = true,
    baselineSize = 4,
  } = body;

  if (!url || !/^https?:\/\//i.test(url)) {
    return NextResponse.json({ error: 'Enter a full URL starting with https://' }, { status: 400 });
  }

  const siteOrigin = process.env.SITE_ORIGIN || 'https://www.kingsresearch.com';
  if (!url.startsWith(siteOrigin)) {
    return NextResponse.json(
      { error: `This checker is configured for ${siteOrigin}. Change SITE_ORIGIN to check another site.` },
      { status: 400 }
    );
  }

  let page;
  try {
    page = await fetchPage(url);
  } catch (err) {
    return NextResponse.json(
      { error: `Could not load the page: ${err.message || err}` },
      { status: 502 }
    );
  }

  const doc = parsePage({
    url: page.url,
    html: page.html,
    css: page.css,
    status: page.status,
    ttfbMs: page.ttfbMs,
  });

  // Sitemap membership and the recent-report baseline run together.
  const [sitemapUrls, baseline] = await Promise.all([
    fetchSitemapUrls(process.env.SITEMAP_URL || `${siteOrigin}/sitemap-reports.xml`),
    useBaseline
      ? buildBaseline({ limit: Number(baselineSize) || 4, excludeUrl: url }).catch(() => null)
      : Promise.resolve(null),
  ]);

  const ai = useAi
    ? await runAiPass({
        text: doc.rawText,
        apiKey: process.env.OPENAI_API_KEY,
        model: process.env.OPENAI_MODEL,
      })
    : { available: false, findings: [], discarded: 0, reason: 'AI pass switched off for this run' };

  const { issues, info, verdicts, probes } = await runAllRules(doc, {
    sitemapUrls,
    baseline,
    aiAvailable: ai.available,
    aiIssues: aiFindingsToIssues(ai),
  });

  const items = itemsForPageType(doc.pageType);
  const passed = items.filter((i) => verdicts[i.key]?.value === 'Yes').length;
  const failed = items.filter((i) => verdicts[i.key]?.value === 'No').length;
  const notRun = items.filter((i) => verdicts[i.key]?.value === 'Not run').length;

  const summary = {
    total: items.length,
    passed,
    failed,
    notRun,
    passPct: items.length ? Math.round((passed / (items.length - notRun || 1)) * 100) : 0,
    blocking: issues.filter((i) => i.severity === 'fail').length,
    warnings: issues.filter((i) => i.severity === 'warn').length,
  };

  const runId = `${doc.slug || 'run'}-${Date.now().toString(36)}`;

  let sheet = { written: false, reason: 'Sheet writing switched off for this run' };
  if (writeToSheet) {
    try {
      sheet = await writeRun({ doc, verdicts, issues, runId, checkedBy, summary });
    } catch (err) {
      sheet = { written: false, reason: `Sheet write failed: ${err.message || err}` };
    }
  }

  return NextResponse.json({
    runId,
    url: doc.url,
    checkedAt: new Date().toISOString(),
    elapsedMs: Date.now() - started,
    page: {
      status: doc.status,
      ttfbMs: doc.ttfbMs,
      pageType: doc.pageType,
      template: doc.template,
      scope: doc.scope,
      h1: doc.h1,
      subtitle: doc.subtitle,
      title: doc.title,
      slug: doc.slug,
      reportId: doc.reportId,
      wordCount: doc.wordCount,
      metaBar: doc.metaBar,
      headings: doc.headings.map(({ level, text, cssUppercase, trailingColon }) => ({
        level,
        text,
        cssUppercase,
        trailingColon,
      })),
      imageCount: doc.images.length,
      linkCount: doc.links.length,
    },
    summary,
    verdicts,
    issues,
    info,
    ai: { available: ai.available, proposed: ai.proposed ?? 0, verified: ai.findings.length, discarded: ai.discarded, reason: ai.reason || null, model: ai.model || null },
    baseline: baseline
      ? { compared: baseline.reports?.length || 0, reports: (baseline.reports || []).map((r) => ({ url: r.url, id: r.id, template: r.template })) }
      : null,
    probes: { links: probes.links.length, images: probes.images.length },
    sheet,
  });
}
