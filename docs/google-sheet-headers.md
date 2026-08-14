# Google Sheet headers

Create four tabs in the spreadsheet with exactly these names, then paste the matching line into cell **A1** of each. The line is tab-separated, so Google Sheets spreads it across the columns on paste.

The tool also writes these headers itself on the first run, so pasting is optional. Doing it by hand first lets you set column widths, freeze row 1 and add conditional formatting before any data lands.

## Report Runs  
65 columns

```
Timestamp	Run ID	URL	Report ID	Slug	Page Type	Template	Scope	Checked By	HTTP Status	Checks Run	Passed	Failed	Pass %	Blocking Issues	Warnings	Top Issue	M01 · Title accurately represents content	M02 · No spelling mistakes in title	M03 · Meta title written	M04 · Meta description written	M05 · URL slug correct and readable	M06 · No spelling mistakes in URL	M07 · Market size numbers verified	M08 · CAGR verified	M09 · Forecast year correct	M10 · Base year correct	M11 · Spelling checked	M12 · Grammar checked	M13 · Professional tone maintained	M14 · Proper heading hierarchy (H1, H2, H3)	M15 · Logical content flow	M16 · Images load correctly	M17 · Charts match text data	M18 · Internal links working	M19 · External links working	M20 · Primary keyword used	M21 · Alt text added to images	M22 · Page loads correctly	M23 · Mobile responsiveness verified	M24 · Page accessible after publishing	M25 · Social preview correct	R26 · Executive summary present	R27 · Market overview included	R28 · Drivers, restraints, opportunities present	R29 · Regional analysis section present	R30 · Competitive landscape included	R31 · Methodology explained	R32 · Tables and charts accurate	R33 · Download / sample report button working	F01 · Headings in Title Case, no ALL CAPS in source	F02 · No CSS text-transform faking caps on headings	F03 · Table header cells in Title Case	F04 · Minor words lowercase in Title Case headings	F05 · Trailing colon and label casing consistent	F06 · Country abbreviation style correct (U.S.)	F07 · Currency written as USD X million	F08 · Number and year-range format consistent	F09 · Country report uses By Country / Country Analysis	F10 · Section headings carry the full market name	F11 · Segmentation bullet and table style consistent	F12 · No double spaces or mixed quote marks	F13 · Internal report links use /report/<slug>-<id>	F14 · Author and reviewer attribution present	F15 · Matches formatting baseline of recent reports
```

## Blog Runs  
64 columns

```
Timestamp	Run ID	URL	Report ID	Slug	Page Type	Template	Scope	Checked By	HTTP Status	Checks Run	Passed	Failed	Pass %	Blocking Issues	Warnings	Top Issue	M01 · Title accurately represents content	M02 · No spelling mistakes in title	M03 · Meta title written	M04 · Meta description written	M05 · URL slug correct and readable	M06 · No spelling mistakes in URL	M07 · Market size numbers verified	M08 · CAGR verified	M09 · Forecast year correct	M10 · Base year correct	M11 · Spelling checked	M12 · Grammar checked	M13 · Professional tone maintained	M14 · Proper heading hierarchy (H1, H2, H3)	M15 · Logical content flow	M16 · Images load correctly	M17 · Charts match text data	M18 · Internal links working	M19 · External links working	M20 · Primary keyword used	M21 · Alt text added to images	M22 · Page loads correctly	M23 · Mobile responsiveness verified	M24 · Page accessible after publishing	M25 · Social preview correct	F01 · Headings in Title Case, no ALL CAPS in source	F02 · No CSS text-transform faking caps on headings	F03 · Table header cells in Title Case	F04 · Minor words lowercase in Title Case headings	F05 · Trailing colon and label casing consistent	F06 · Country abbreviation style correct (U.S.)	F07 · Currency written as USD X million	F08 · Number and year-range format consistent	F09 · Country report uses By Country / Country Analysis	F10 · Section headings carry the full market name	F11 · Segmentation bullet and table style consistent	F12 · No double spaces or mixed quote marks	F13 · Internal report links use /report/<slug>-<id>	F14 · Author and reviewer attribution present	F15 · Matches formatting baseline of recent reports	B01 · Engaging introduction	B02 · Topic clearly explained	B03 · Logical storytelling	B04 · Examples or use cases included	B05 · Readable subheadings	B06 · Conclusion present	B07 · CTA to report or service included
```

## PR Runs  
63 columns

```
Timestamp	Run ID	URL	Report ID	Slug	Page Type	Template	Scope	Checked By	HTTP Status	Checks Run	Passed	Failed	Pass %	Blocking Issues	Warnings	Top Issue	M01 · Title accurately represents content	M02 · No spelling mistakes in title	M03 · Meta title written	M04 · Meta description written	M05 · URL slug correct and readable	M06 · No spelling mistakes in URL	M07 · Market size numbers verified	M08 · CAGR verified	M09 · Forecast year correct	M10 · Base year correct	M11 · Spelling checked	M12 · Grammar checked	M13 · Professional tone maintained	M14 · Proper heading hierarchy (H1, H2, H3)	M15 · Logical content flow	M16 · Images load correctly	M17 · Charts match text data	M18 · Internal links working	M19 · External links working	M20 · Primary keyword used	M21 · Alt text added to images	M22 · Page loads correctly	M23 · Mobile responsiveness verified	M24 · Page accessible after publishing	M25 · Social preview correct	F01 · Headings in Title Case, no ALL CAPS in source	F02 · No CSS text-transform faking caps on headings	F03 · Table header cells in Title Case	F04 · Minor words lowercase in Title Case headings	F05 · Trailing colon and label casing consistent	F06 · Country abbreviation style correct (U.S.)	F07 · Currency written as USD X million	F08 · Number and year-range format consistent	F09 · Country report uses By Country / Country Analysis	F10 · Section headings carry the full market name	F11 · Segmentation bullet and table style consistent	F12 · No double spaces or mixed quote marks	F13 · Internal report links use /report/<slug>-<id>	F14 · Author and reviewer attribution present	F15 · Matches formatting baseline of recent reports	P01 · Headline strong and clear	P02 · Press release date included	P03 · Location mentioned	P04 · Official spokesperson quote included	P05 · Company introduction present	P06 · Media contact details included
```

## Issue Log  
12 columns

```
Timestamp	Run ID	URL	Rule ID	Severity	Category	Checklist Item	Where	Found (exact text on page)	Expected	Suggested Fix	Verified By
```

## Conditional formatting worth adding

On the three run tabs, select the checklist columns (R onward) and add two rules:

- Text is exactly `No` → red fill
- Text is exactly `Yes` → green fill

On **Issue Log**, add: text is exactly `fail` in column E → red text.
