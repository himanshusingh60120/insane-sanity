import { google } from 'googleapis';
import { headerRow, itemsForPageType, ISSUE_COLUMNS, RUN_COLUMNS } from './checklist.js';

function auth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  if (!email || !key) return null;
  return new google.auth.JWT({
    email,
    key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

function tabFor(pageType) {
  if (pageType === 'blog') return process.env.SHEET_TAB_BLOG || 'Blog Runs';
  if (pageType === 'press-release') return process.env.SHEET_TAB_PR || 'PR Runs';
  return process.env.SHEET_TAB_REPORT || 'Report Runs';
}

async function ensureTab(sheets, spreadsheetId, title, header) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties' });
  const exists = meta.data.sheets.some((s) => s.properties.title === title);

  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title, gridProperties: { frozenRowCount: 1 } } } }] },
    });
  }

  const first = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${title}!1:1`,
  });
  const current = first.data.values?.[0] || [];
  if (current.length !== header.length || current.some((c, i) => c !== header[i])) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${title}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [header] },
    });
  }
}

/**
 * Writes one row to the run tab and one row per issue to the issue log.
 * The run tab carries only Yes / No / Not run in the checklist columns — no
 * prose, so the sheet stays filterable and the AI layer can never write into it
 * beyond a Yes/No derived from a verified finding.
 */
export async function writeRun({ doc, verdicts, issues, runId, checkedBy, summary }) {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  const client = auth();
  if (!client || !spreadsheetId) {
    return { written: false, reason: 'Google Sheets credentials or sheet id not configured' };
  }

  const sheets = google.sheets({ version: 'v4', auth: client });
  const runTab = tabFor(doc.pageType);
  const issueTab = process.env.SHEET_TAB_ISSUES || 'Issue Log';
  const timestamp = new Date().toISOString();

  const header = headerRow(doc.pageType);
  await ensureTab(sheets, spreadsheetId, runTab, header);
  await ensureTab(sheets, spreadsheetId, issueTab, ISSUE_COLUMNS);

  const topIssue = issues.find((i) => i.severity === 'fail');
  const runRow = [
    timestamp,
    runId,
    doc.url,
    doc.reportId,
    doc.slug,
    doc.pageType,
    doc.template,
    doc.scope,
    checkedBy || 'sanity-checker',
    String(doc.status),
    String(summary.total),
    String(summary.passed),
    String(summary.failed),
    `${summary.passPct}%`,
    String(summary.blocking),
    String(summary.warnings),
    topIssue ? `${topIssue.ruleId}: ${topIssue.title}` : '',
    ...itemsForPageType(doc.pageType).map((i) => verdicts[i.key]?.value ?? ''),
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${runTab}!A1`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [runRow] },
  });

  const issueRows = issues.map((i) => [
    timestamp,
    runId,
    doc.url,
    i.ruleId,
    i.severity,
    i.category,
    (i.items || []).join(', '),
    i.where || '',
    truncate(i.found),
    truncate(i.expected),
    truncate(i.fix),
    i.verifiedBy || 'Deterministic rule',
  ]);

  if (issueRows.length) {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${issueTab}!A1`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: issueRows },
    });
  }

  const sheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
  return { written: true, runTab, issueTab, issueRows: issueRows.length, sheetUrl };
}

function truncate(v, max = 480) {
  const s = String(v ?? '');
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** Exposed so the UI can render the exact headers to paste into an empty sheet. */
export function sheetTemplates() {
  return {
    'Report Runs': headerRow('report'),
    'Blog Runs': headerRow('blog'),
    'PR Runs': headerRow('press-release'),
    'Issue Log': ISSUE_COLUMNS,
    _runColumns: RUN_COLUMNS,
  };
}
