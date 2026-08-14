# Editorial sanity checker

Paste a live Kings Research report URL. The tool fetches the page and its stylesheets, runs about seventy deterministic rules over the parsed DOM, checks every link and image, compares the page against the last four published reports, and writes a Yes/No row to the master Google Sheet.

Built after a QA miss where casing on a live page did not match house style. The rules below are derived from diffing four real reports — see [`docs/formatting-baseline.md`](docs/formatting-baseline.md) for what that comparison turned up.

---

## Why you can trust the Yes/No

Every verdict in the sheet comes from a rule that can point at the exact text on the page. No verdict is a language model's opinion.

Three checklist rows genuinely need a model — spelling, grammar and tone are not regex problems. For those, the guard is mechanical rather than a prompt instruction:

1. The model must return the **exact span** it is objecting to, copied character for character.
2. Before a finding is shown or written anywhere, the server checks that span appears **verbatim** in the page source.
3. The correction must be a **minimal edit** of the span it quotes. Replacing a 90-character clause with the single word "suppliers" is not a correction, it is a different sentence.
4. A spelling finding must quote **a word, not a sentence** — quoting a whole clause is how a model smuggles an invented claim past a verbatim check, because the sentence is real even when the error is not.
5. Any word the model names inside its own note must **actually appear in the quoted span**. A note reading *"the word 'cer' is a typo"* is thrown away when `cer` appears nowhere in the text.
6. Anything failing any guard is discarded, counted, and the reason is shown in the run summary.

Guards 3–5 exist because guards 1–2 were not enough. An earlier build passed a finding that quoted a real sentence from a live page and then claimed a word inside it — a word that did not exist — was a typo. The quote verified, so it survived. Verifying that the span exists is not the same as verifying that the claim about it is true. The run summary shows *"N findings kept, M discarded for not matching the page text verbatim"*, so drift is visible rather than silent.

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

66 checklist rows on a report page, drawn from three sources.

**M01–M25** — every row from the *Master Checklist* tab of `editorial_master_checklist.xlsx`.
**R26–R33** — every row from the *Research Report* tab.
**F01–F16** — the house formatting standard, derived from the four-report diff. This is the block that catches the "reads fine, looks fine, is inconsistent" class of miss.

Blog and press-release URLs get **B01–B07** and **P01–P06** from their own xlsx tabs instead of the research rows; the tool picks the column set from the URL path.

### What is allowed to fail a page

A check may only produce a failure — the thing that writes **No** into the sheet — when it maps to an item on the editorial checklist, or to the formatting standard that was explicitly asked for. Anything inferred from reading the site is an **observation**, not a defect: reported as a warning (visible, never flips a column) or as info (recorded in the JSON only).

Two things that were wrongly failing pages in an earlier build, and are now observations:

- **Internal links using two URL shapes** (`/cosmetics-market-448` alongside `/report/dietary-supplements-market-2870`). Both resolve. The checklist asks whether internal links *work*, and they do. Consolidating them would tidy up link equity, but that is your call, not a defect.
- **Non-breaking spaces from a Word paste.** Untidy, not a spelling error.

`LINK-00` now reports the plain answer to the checklist item instead: how many links were checked and how many responded.

A row is **No** when at least one rule mapped to it failed. Warnings never flip a row to No — they surface in the tool and the Issue Log, so the sheet stays a clean pass/fail signal.

Each row is reached one of three ways, shown in the tool:

- **rule** — a deterministic check decides it outright
- **proxy signal** — the strongest machine-observable evidence for something a human judges more broadly. *Charts match text data* checks that both standard charts exist and that their alt text carries the market name and the forecast years; it cannot read the chart.
- **AI, verified against source** — the three copy-editing rows

### Casing: only shouting counts

Title Case with capitalised minor words — "Key Companies **In The** U.S. Postbiotics Market" — is house style and passes. A heading is a casing defect only when the whole thing is shouting, which `CASE-01` catches, and it ignores acronyms like U.S., R&D and CAGR so it will not misfire on a correct heading that contains one. The same applies to Title Cased question headings.

`docs/parsetest.mjs` asserts these stay silent, so the rules cannot creep back in.

### Section blueprints are deliberately soft

Reports in the wild are not cleanly Template A or B. The cleaning-services report opens with Market Overview like a B, then carries Key Market Highlights and a Snapshot like an A, and titles its snapshot "*Market* Snapshot" rather than "*Report* Snapshot". Sections are therefore graded by evidence: only those observed on **every** peer report of that template can fail the page, everything else warns. Sections that live in the sidebar rail on some templates are searched for across the whole document.

`BASE-01`, which compares against the reports actually published alongside this one, is meant to carry the real weight here — it is evidence-based rather than hard-coded, and it updates itself as house style moves.

### The checks worth knowing about

**CAGR is recomputed, not read.** The tool parses the base and forecast values, recomputes the growth rate over both plausible anchor periods, and fails the row if the stated figure is more than 0.15pp from either. This is what catches an arithmetic slip that reads perfectly well in prose. Report 3129 fails it today.

**Figures are cross-checked between sections.** The overview, the highlights, the FAQ and the meta description must agree. Segment and regional figures are tagged and excluded, because a segment value for the same forecast year is not a contradiction of the total.

**Source caps and CSS caps are separated.** Same appearance, opposite fixes. See the baseline doc.

**Links are actually requested.** Up to 45 per page, 6 at a time, HEAD with a ranged-GET fallback for servers that reject HEAD.

**The Buy Now link is checked against the report id in the slug.** A mismatch means the button sells the wrong report.

**Whitespace is scanned per text segment, never across a tag boundary.** Flattened container text is useless here: two adjacent paragraphs concatenate, so a trailing `&nbsp;` in one plus inter-tag whitespace before the next reads as a double space that exists nowhere in the copy. Non-breaking spaces stay as U+00A0 through parsing for the same reason, and get their own warning (TECH-15) rather than being folded into TECH-06.

### Fonts, sizes and mobile — what F16 covers

**The size is checked against a value, not flagged for existing.** Set `BODY_FONT_SIZE` (default `12pt`). Units are normalised, so `12pt`, `16px` and `1rem` all count as the same size. If the page is 12pt and you want 12pt, that is a pass and it shows as an observation, not a finding. Only sizes that differ fail, and the finding names the size, the count and the first offending text.

`BODY_FONT_FAMILY` works the same way: set it and any other family in body copy fails; leave it unset and the tool only warns when a page mixes more than one.

**Mobile font size is checked two ways, neither of which needs a browser:**

- **TYPO-06** — the one that matters. An inline style beats a media query, always. If the stylesheet shrinks body text at a phone breakpoint *and* the copy carries an inline size, phone readers keep the desktop size. This fails, and it maps to M23.
- **TYPO-07** — reads the font sizes declared inside media queries under 820px and reports the mobile scale. Warns if the stylesheet declares no mobile size at all.
Both read the stylesheet the page already links, so neither costs an extra request.

**Still not covered:** the *computed* pixel size of a rendered paragraph, which needs a layout engine. TYPO-06 covers the case where that would actually bite — an inline override defeating the responsive rule. If you later want true rendered measurement, the clean route is a scheduled job on a container runtime, not a browser bolted onto this endpoint.

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
node docs/aitest.mjs      # the AI verification guards, no API key needed
```

`aitest.mjs` feeds fabricated model output straight through the verification layer, including the real hallucination that got through an earlier build. It needs no API key.

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
