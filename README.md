# Editorial sanity checker

Paste a live Kings Research report URL. The tool fetches the page and its stylesheets, runs about seventy deterministic rules over the parsed DOM, checks every link and image, compares the page against the last four published reports, and writes a Yes/No row to the master Google Sheet.

Built after a QA miss where casing on a live page did not match house style. The rules below are derived from diffing four real reports — see [`docs/formatting-baseline.md`](docs/formatting-baseline.md) for what that comparison turned up.

---

## Why you can trust the Yes/No

Every verdict in the sheet comes from a rule that can point at the exact text on the page. No verdict is a language model's opinion.

Three checklist rows genuinely need a model — spelling, grammar and tone are not regex problems. For those, the guard is mechanical rather than a prompt instruction:

1. The model must return the **exact span** it is objecting to, copied character for character.
2. Before a finding is shown or written anywhere, the server checks that span appears **verbatim** in the page source.
3. Anything that fails that check is discarded and counted.

A model that invents a sentence produces a quote that does not exist in the source, and the finding disappears before you ever see it. The run summary shows *"N findings kept, M discarded for not matching the page text verbatim"*, so drift is visible rather than silent.

With no `OPENAI_API_KEY` set, those three rows read **Not run** rather than guessing, and everything else works unchanged.

---

## Setup

### 1. Deploy

```bash
git init && git add . && git commit -m "editorial sanity checker"
vercel
```

Node 20+. No build configuration needed beyond the defaults.

### 2. Google service account

1. Google Cloud Console → new project → enable the **Google Sheets API**.
2. Create a service account, add a key, download the JSON.
3. **Share the spreadsheet with the service account e-mail as an Editor.** Skipping this is the single most common failure; writes come back 403 and the tool reports it in the strip under the scoreboard.

### 3. Environment variables

Copy `.env.example` into the Vercel dashboard. The one that trips people up is `GOOGLE_PRIVATE_KEY` — paste the real multi-line key into Vercel, or keep the `\n` escapes and wrap it in double quotes for local `.env.local`. `lib/sheets.js` handles both.

`OPENAI_API_KEY` is the key you said you would add. `OPENAI_MODEL` defaults to `gpt-4o-mini`.

Set `KR_ACCESS_TOKEN` to require an `x-kr-token` header on `/api/check`, otherwise the deployment is open to anyone with the URL.

### 4. The sheet

Four tabs: **Report Runs** (65 columns), **Blog Runs** (64), **PR Runs** (63), **Issue Log** (12).

The tool creates the tabs and writes the header row itself on first run. To set them up by hand instead — worth doing, so you can freeze row 1 and add conditional formatting before data lands — the exact tab-separated header rows are in [`docs/google-sheet-headers.md`](docs/google-sheet-headers.md).

Checklist columns take only `Yes`, `No` or `Not run`. All the prose lives in **Issue Log** and in the tool. That keeps the run tabs filterable and means the AI layer can never write anything into the sheet beyond a Yes/No derived from a verified finding.

---

## What gets checked

63 checklist rows on a report page, drawn from three sources.

**M01–M25** — every row from the *Master Checklist* tab of `editorial_master_checklist.xlsx`.
**R26–R33** — every row from the *Research Report* tab.
**F01–F15** — the house formatting standard, derived from the four-report diff. This is the block that catches the "reads fine, looks fine, is inconsistent" class of miss.

Blog and press-release URLs get **B01–B07** and **P01–P06** from their own xlsx tabs instead of the research rows; the tool picks the column set from the URL path.

A row is **No** when at least one rule mapped to it failed. Warnings never flip a row to No — they surface in the tool and the Issue Log, so the sheet stays a clean pass/fail signal.

Each row is reached one of three ways, shown in the tool:

- **rule** — a deterministic check decides it outright
- **proxy signal** — the strongest machine-observable evidence for something a human judges more broadly. *Charts match text data* checks that both standard charts exist and that their alt text carries the market name and the forecast years; it cannot read the chart.
- **AI, verified against source** — the three copy-editing rows

### The checks worth knowing about

**CAGR is recomputed, not read.** The tool parses the base and forecast values, recomputes the growth rate over both plausible anchor periods, and fails the row if the stated figure is more than 0.15pp from either. This is what catches an arithmetic slip that reads perfectly well in prose. Report 3129 fails it today.

**Figures are cross-checked between sections.** The overview, the highlights, the FAQ and the meta description must agree. Segment and regional figures are tagged and excluded, because a segment value for the same forecast year is not a contradiction of the total.

**Source caps and CSS caps are separated.** Same appearance, opposite fixes. See the baseline doc.

**Links are actually requested.** Up to 45 per page, 6 at a time, HEAD with a ranged-GET fallback for servers that reject HEAD.

**The Buy Now link is checked against the report id in the slug.** A mismatch means the button sells the wrong report.

---

## The evidence line

Every finding shows the exact string from the page with its invisible characters made visible — a double space renders as `··`, a non-breaking space as `⍽`, a tab as `→`.

```
On page    …Users, and Regional Analysis,··2026 - 2033
Should be  Single spaces
✎ Find-and-replace two spaces with one.
```

That double space is in the subtitle of all four reports I compared. It is invisible in a CMS field, which is exactly why it survived review.

---

## Layout

```
app/
  page.jsx                 UI — form, scoreboard, ledger, issue stream
  layout.jsx  globals.css
  api/check/route.js       the main endpoint
  api/baseline/route.js    house-style drift across recent reports
lib/
  fetchPage.js             page + same-origin stylesheets, HEAD/GET probes, sitemap
  parse.js                 cheerio → page model (meta, headings, tables, links, CSS caps map)
  checklist.js             checklist ↔ sheet columns — single source of truth
  ai.js                    the verified copy-edit pass
  sheets.js                tab creation, header sync, row append
  baseline.js              recent-report signature and drift
  util.js                  casing, money parsing, CAGR, evidence formatting
  rules/
    index.js               runner + verdict folding + baseline comparison
    casing.js structure.js numbers.js meta.js links.js images.js technical.js blogpr.js
components/
  ChecklistLedger.jsx  IssueStream.jsx
docs/
  formatting-baseline.md   what the four-report comparison found
  google-sheet-headers.md  exact header rows to paste
  selftest.mjs  parsetest.mjs
```

---

## Tests

Both run offline with no network and no API keys.

```bash
node docs/selftest.mjs    # rules against a stub built from real 3124 content
node docs/parsetest.mjs   # cheerio parser + rules against a synthetic page
```

`selftest.mjs` asserts in both directions: eight rules must fire on known defects, and three must stay silent on correct content. A checker that cries wolf gets switched off, so the false-positive guards are tested as explicitly as the detections.

`parsetest.mjs` needs `cheerio` installed. It plants six defects including a heading uppercased by CSS and asserts the parser tells it apart from a heading uppercased in the source.

Both caught real bugs during the build — a `\b` after `U.S.` never matches, because a word boundary cannot exist between `.` and a space, which had silently disabled country detection and one grammar rule.

---

## API

```
POST /api/check
{ "url": "...", "checkedBy": "", "writeToSheet": true, "useAi": true, "useBaseline": true }
```

Returns the parsed page summary, per-item verdicts, the full issue list, AI kept/discarded counts, and the sheet write result. A run takes 20–40 seconds, most of it link and image probing; `maxDuration` is set to 120s, which needs a Vercel plan above Hobby.

```
GET /api/baseline?limit=4
```

Where the recent reports disagree with each other. Run it monthly.

---

## Adding a rule

1. Write it in the relevant `lib/rules/*.js`, returning `{ ruleId, category, severity, items, title, where, found, expected, fix }`. `items` are the checklist keys it can fail; `found` should be the literal text from the page.
2. If it needs a new sheet column, add it to `ITEMS` in `lib/checklist.js`. Headers regenerate automatically on the next run.
3. Add the case to `docs/selftest.mjs` — to `EXPECTED_RULES` if it should fire, to `MUST_NOT_FIRE` if you are guarding a false positive.

Keep `severity: 'warn'` for anything you are not certain about. Warnings do not flip a sheet row to No, so a noisy new rule cannot corrupt the pass/fail history while you tune it.
