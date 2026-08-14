# Formatting baseline

Compiled by crawling four live report pages and diffing them against each other:

| Report | URL slug | Template |
| --- | --- | --- |
| Target | `us-spatial-biology-market-3124` | A |
| Peer | `us-organ-on-a-chip-market-3129` | A |
| Peer | `global-tea-extract-market-3143` | A |
| Peer | `us-application-specific-integrated-circuit-asic-market-3148` | B |

---

## 1. There are two live templates, not one

This is the finding that shapes everything else. Any checker that assumes a single blueprint will flag half the catalogue as broken.

**Template A** — Market Definition → `<Market>` Overview → Key Market Highlights → three question H2s → `<Market>` Report Snapshot → Market Segmentation → market scenario → Regulatory Frameworks → Competitive Landscape → Key Companies → Recent Developments → FAQ.
Used by 3124, 3129, 3143, and the "Size, Share, Growth & Industry Analysis" titles generally.

**Template B** — Market Overview → Market Segmentation table → question H2s carrying their own tables → *Key Insight* callouts → Customization Options → FAQ. No Market Definition, no Key Market Highlights, no Recent Developments.
Used by 3148 and the newer "Strategic Market Intelligence Report & Executive Description" titles (3147, 3150, 3152, 3154).

Both are in active use and both are current, so the tool detects which one a page follows and checks it only against its own blueprint. Choosing between them is an editorial decision, not a defect, and the tool does not flag it.

---

## 2. On the ALL CAPS miss specifically

The sticky header renders `U.S. SPATIAL BIOLOGY MARKET` on **every** report — 3124, 3129, 3143 and 3148 all do it. That one is systematic, not an editorial slip, and no amount of retyping in the CMS will change it.

The real casing inconsistency is in **table headers**:

| Report | Snapshot table header row |
| --- | --- |
| 3124 | `Segmentation` / `Details` |
| 3129 | `Segmentation` / `Details` |
| 3148 | `SEGMENTATION` / `DETAILS` |

Same class of miss, invisible unless you diff pages against each other, which is exactly what QA cannot do by eye.

Because these two cases look identical on screen and need opposite fixes, the tool separates them:

- **CASE-01** — the HTML source is upper-case → content fix in the CMS
- **CASE-02** — the source is correctly cased and CSS `text-transform` uppercases it → template fix, and *do not retype the content*

---

## 3. Defects confirmed on live pages

Each of these I verified by hand or by arithmetic.

### 3124 — U.S. Spatial Biology Market

| What | Detail | Rule |
| --- | --- | --- |
| Title tag | `Market Size & Growth,2033` — no space after the comma. Ships to every search result. | META-02 |
| Heading | `Key Companies **In The** U.S. Spatial Biology Market` — 3129 correctly uses "in the". | CASE-04 |
| Country scope | Labelled `Regional Analysis` and `By Region` although it is a single-country report. 3129 and 3148 correctly use `Country Analysis` / `By Country`. | STRUCT-08 |
| Tense | "The Pharma & Biotech segment **is expected to reach** USD 158.3 million in revenue in 2025." 2025 is the base year and already measured; the body text says "garnered". | NUM-09 |
| Grammar | "market scenario of spatial biology **in U.S.**?" — missing article. | CASE-08 |
| Meta description | Uses `USD 1,251.9M`; peer reports spell the unit out. | NUM-06 |
| Attribution | No reviewer in the meta bar. | TECH-11 |

CAGR checks out: 343.3 → 1,251.9 over 8 years is 17.55% exactly.

### 3129 — U.S. Organ-on-a-Chip Market

**The CAGR does not compute.** Stated 24.34%. From the figures on the page:

- 2026 → 2033 (7 years): 215.37 → 869.1 implies **22.05%**
- 2025 → 2033 (8 years): 172.9 → 869.1 implies **22.37%**
- At the stated 24.34% from 215.37, 2033 would be **USD 989.6 million**, not 869.1

Neither anchoring convention produces 24.34%. This shipped. Caught by NUM-02.

Also: FAQ reads `U.S.organ-on-a-chip` with no space after the abbreviation (CASE-08), and the snapshot heading is `Organ-on-a-Chip Market Report Snapshot` — the country is missing from an H1 that reads `U.S. Organ-on-a-Chip Market` (STRUCT-05).

### 3143 — Global Tea Extract Market

| What | Detail | Rule |
| --- | --- | --- |
| Snapshot markup | Rendered as a `<ul>`, not a `<table>`, unlike every other report. Reads fine, breaks every downstream scrape. | STRUCT-09 |
| Decimals | `80.1%` and `80.10%` for the same figure on the same page. | NUM-07 |
| Internal links | Split between `/microfluidics-market-266` and `/report/dietary-supplements-market-2870`. Both resolve, so nothing looks broken, but the two forms split link equity and make analytics unusable. | LINK-01 |

### 3148 — U.S. ASIC Market

| What | Detail | Rule |
| --- | --- | --- |
| Callout label | `Key Insight:` and `Key insight:` both used on one page. | CASE-07 |
| Table headers | `SEGMENTATION` / `DETAILS` / `CHALLENGE` / `GROWTH CATALYSTS` in caps. | CASE-03 |
| Currency | `$ 33.08B` — dollar sign, a space, and an abbreviated unit, in the meta description. | NUM-06 |

---

## 4. Site-wide inconsistencies to settle as policy

These are not one page's fault. Someone needs to pick a side, and then the tool enforces it.

**CAGR anchoring.** 3124 and 3148 anchor 8 years from the 2025 base value. 3143 anchors 7 years from the 2026 value. Both label the result "2026–2033". Two different sums under one label.
→ NUM-02 currently accepts either and reports which one a page used, so you can see the split before you legislate. Once you pick one, tighten the rule to that anchor.

**Reviewer credit.** 3143 and 3148 carry `Reviewed By` in the meta bar. 3124 and 3129 credit the reviewer only at the foot of the page. → TECH-11, currently a warning.

**Keyword list punctuation.** 3129 and 3148 end the `meta[name=keywords]` list with a full stop; 3124 and 3143 do not. → META-04.

**Segmentation bullet lead-ins.** 3129 bolds `By Chip Type (…):`; 3124 and 3143 leave it plain. → STRUCT-10 flags a mix *within* a page; the cross-page split is a policy call.

**The double space.** `Analysis,␣␣2026 - 2033` appears in the subtitle of all four reports. It is almost certainly a template concatenation bug rather than typing, so fixing it once in the template fixes it everywhere. → TECH-06.

---

## 5. How the baseline stays current

`GET /api/baseline?limit=4` re-reads `sitemap-reports.xml`, takes the highest report ids (which increment with publication), and reports where the recent reports disagree with each other. Run it monthly. "Formatting should be regularised" is only checkable against something, and the last few published reports are the most honest available definition of current house style.

During a normal check the same comparison runs inline, and **BASE-01** fires when a section that every recent peer report has is missing from the page being checked.
