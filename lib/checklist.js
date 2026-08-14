/**
 * The single source of truth for the Google Sheet.
 *
 * M01–M25  → the "Master Checklist" tab of editorial_master_checklist.xlsx
 * R26–R33  → the "Research Report" tab
 * B01–B07  → the "Blog" tab
 * P01–P06  → the "Press Release" tab
 * F01–F15  → Kings Research house formatting standard, derived by diffing four
 *            live reports (3124, 3129, 3143, 3148). These are the checks that
 *            catch the "looks fine, reads fine, is inconsistent" class of miss.
 *
 * `mode` tells you how a verdict is reached:
 *   auto      — a deterministic rule decides it outright
 *   proxy     — a deterministic rule checks the strongest machine-observable
 *               signal for something a human would judge more broadly
 *   ai-verify — an LLM proposes findings, and each one is discarded unless the
 *               exact span it quotes is found verbatim in the page source
 */

export const ITEMS = [
  // ── Master Checklist ────────────────────────────────────────────────────────
  { key: 'M01', category: 'Title & Metadata', item: 'Title accurately represents content', mode: 'auto' },
  { key: 'M02', category: 'Title & Metadata', item: 'No spelling mistakes in title', mode: 'auto' },
  { key: 'M03', category: 'Title & Metadata', item: 'Meta title written', mode: 'auto' },
  { key: 'M04', category: 'Title & Metadata', item: 'Meta description written', mode: 'auto' },
  { key: 'M05', category: 'URL', item: 'URL slug correct and readable', mode: 'auto' },
  { key: 'M06', category: 'URL', item: 'No spelling mistakes in URL', mode: 'auto' },
  { key: 'M07', category: 'Content Accuracy', item: 'Market size numbers verified', mode: 'proxy' },
  { key: 'M08', category: 'Content Accuracy', item: 'CAGR verified', mode: 'auto' },
  { key: 'M09', category: 'Content Accuracy', item: 'Forecast year correct', mode: 'auto' },
  { key: 'M10', category: 'Content Accuracy', item: 'Base year correct', mode: 'auto' },
  { key: 'M11', category: 'Grammar', item: 'Spelling checked', mode: 'ai-verify' },
  { key: 'M12', category: 'Grammar', item: 'Grammar checked', mode: 'ai-verify' },
  { key: 'M13', category: 'Grammar', item: 'Professional tone maintained', mode: 'ai-verify' },
  { key: 'M14', category: 'Structure', item: 'Proper heading hierarchy (H1, H2, H3)', mode: 'auto' },
  { key: 'M15', category: 'Structure', item: 'Logical content flow', mode: 'auto' },
  { key: 'M16', category: 'Images', item: 'Images load correctly', mode: 'auto' },
  { key: 'M17', category: 'Images', item: 'Charts match text data', mode: 'proxy' },
  { key: 'M18', category: 'Links', item: 'Internal links working', mode: 'auto' },
  { key: 'M19', category: 'Links', item: 'External links working', mode: 'auto' },
  { key: 'M20', category: 'SEO', item: 'Primary keyword used', mode: 'auto' },
  { key: 'M21', category: 'SEO', item: 'Alt text added to images', mode: 'auto' },
  { key: 'M22', category: 'Technical', item: 'Page loads correctly', mode: 'auto' },
  { key: 'M23', category: 'Technical', item: 'Mobile responsiveness verified', mode: 'proxy' },
  { key: 'M24', category: 'Post Publish', item: 'Page accessible after publishing', mode: 'auto' },
  { key: 'M25', category: 'Post Publish', item: 'Social preview correct', mode: 'auto' },

  // ── Research Report tab ─────────────────────────────────────────────────────
  { key: 'R26', category: 'Research Report', item: 'Executive summary present', mode: 'auto', appliesTo: ['report'] },
  { key: 'R27', category: 'Research Report', item: 'Market overview included', mode: 'auto', appliesTo: ['report'] },
  { key: 'R28', category: 'Research Report', item: 'Drivers, restraints, opportunities present', mode: 'auto', appliesTo: ['report'] },
  { key: 'R29', category: 'Research Report', item: 'Regional analysis section present', mode: 'auto', appliesTo: ['report'] },
  { key: 'R30', category: 'Research Report', item: 'Competitive landscape included', mode: 'auto', appliesTo: ['report'] },
  { key: 'R31', category: 'Research Report', item: 'Methodology explained', mode: 'auto', appliesTo: ['report'] },
  { key: 'R32', category: 'Research Report', item: 'Tables and charts accurate', mode: 'proxy', appliesTo: ['report'] },
  { key: 'R33', category: 'Research Report', item: 'Download / sample report button working', mode: 'auto', appliesTo: ['report'] },

  // ── Kings Research formatting standard ──────────────────────────────────────
  { key: 'F01', category: 'Formatting Standard', item: 'Headings in Title Case, no ALL CAPS in source', mode: 'auto' },
  { key: 'F02', category: 'Formatting Standard', item: 'No CSS text-transform faking caps on headings', mode: 'auto' },
  { key: 'F03', category: 'Formatting Standard', item: 'Table header cells in Title Case', mode: 'auto' },
  { key: 'F04', category: 'Formatting Standard', item: 'Minor words lowercase in Title Case headings', mode: 'auto' },
  { key: 'F05', category: 'Formatting Standard', item: 'Trailing colon and label casing consistent', mode: 'auto' },
  { key: 'F06', category: 'Formatting Standard', item: 'Country abbreviation style correct (U.S.)', mode: 'auto' },
  { key: 'F07', category: 'Formatting Standard', item: 'Currency written as USD X million', mode: 'auto' },
  { key: 'F08', category: 'Formatting Standard', item: 'Number and year-range format consistent', mode: 'auto' },
  { key: 'F09', category: 'Formatting Standard', item: 'Country report uses By Country / Country Analysis', mode: 'auto' },
  { key: 'F10', category: 'Formatting Standard', item: 'Section headings carry the full market name', mode: 'auto' },
  { key: 'F11', category: 'Formatting Standard', item: 'Segmentation bullet and table style consistent', mode: 'auto' },
  { key: 'F12', category: 'Formatting Standard', item: 'No double spaces or mixed quote marks', mode: 'auto' },
  { key: 'F13', category: 'Formatting Standard', item: 'Internal report links use /report/<slug>-<id>', mode: 'auto' },
  { key: 'F14', category: 'Formatting Standard', item: 'Author and reviewer attribution present', mode: 'auto' },
  { key: 'F15', category: 'Formatting Standard', item: 'Matches formatting baseline of recent reports', mode: 'auto' },
  { key: 'F16', category: 'Formatting Standard', item: 'No inline font, size or colour overrides in body copy', mode: 'auto' },

  // ── Blog tab ────────────────────────────────────────────────────────────────
  { key: 'B01', category: 'Blog', item: 'Engaging introduction', mode: 'proxy', appliesTo: ['blog'] },
  { key: 'B02', category: 'Blog', item: 'Topic clearly explained', mode: 'ai-verify', appliesTo: ['blog'] },
  { key: 'B03', category: 'Blog', item: 'Logical storytelling', mode: 'proxy', appliesTo: ['blog'] },
  { key: 'B04', category: 'Blog', item: 'Examples or use cases included', mode: 'proxy', appliesTo: ['blog'] },
  { key: 'B05', category: 'Blog', item: 'Readable subheadings', mode: 'auto', appliesTo: ['blog'] },
  { key: 'B06', category: 'Blog', item: 'Conclusion present', mode: 'auto', appliesTo: ['blog'] },
  { key: 'B07', category: 'Blog', item: 'CTA to report or service included', mode: 'auto', appliesTo: ['blog'] },

  // ── Press Release tab ───────────────────────────────────────────────────────
  { key: 'P01', category: 'Press Release', item: 'Headline strong and clear', mode: 'proxy', appliesTo: ['press-release'] },
  { key: 'P02', category: 'Press Release', item: 'Press release date included', mode: 'auto', appliesTo: ['press-release'] },
  { key: 'P03', category: 'Press Release', item: 'Location mentioned', mode: 'auto', appliesTo: ['press-release'] },
  { key: 'P04', category: 'Press Release', item: 'Official spokesperson quote included', mode: 'auto', appliesTo: ['press-release'] },
  { key: 'P05', category: 'Press Release', item: 'Company introduction present', mode: 'auto', appliesTo: ['press-release'] },
  { key: 'P06', category: 'Press Release', item: 'Media contact details included', mode: 'auto', appliesTo: ['press-release'] },
];

const BY_KEY = new Map(ITEMS.map((i) => [i.key, i]));
export const itemFor = (key) => BY_KEY.get(key);

/** Which checklist keys apply to a given page type. */
export function itemsForPageType(pageType) {
  return ITEMS.filter((i) => !i.appliesTo || i.appliesTo.includes(pageType));
}

/** Run metadata columns that sit in front of the checklist columns in the sheet. */
export const RUN_COLUMNS = [
  'Timestamp',
  'Run ID',
  'URL',
  'Report ID',
  'Slug',
  'Page Type',
  'Template',
  'Scope',
  'Checked By',
  'HTTP Status',
  'Checks Run',
  'Passed',
  'Failed',
  'Pass %',
  'Blocking Issues',
  'Warnings',
  'Top Issue',
];

export const ISSUE_COLUMNS = [
  'Timestamp',
  'Run ID',
  'URL',
  'Rule ID',
  'Severity',
  'Category',
  'Checklist Item',
  'Where',
  'Found (exact text on page)',
  'Expected',
  'Suggested Fix',
  'Verified By',
];

/** The full header row for a run tab. */
export function headerRow(pageType) {
  return [...RUN_COLUMNS, ...itemsForPageType(pageType).map((i) => `${i.key} · ${i.item}`)];
}
