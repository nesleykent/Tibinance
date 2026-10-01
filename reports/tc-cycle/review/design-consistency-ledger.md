# Progress ledger: design consistency pass (started 2026-09-28)

Resume rule: read this file first and continue from "Next step". Never relaunch agents for
steps marked done. Audit and edits are done inline; one small verification workflow (at most
4 agents) runs only after the edits, and only once.

Worktree: .claude/worktrees/design-consistency-quota-f4f768 (branch claude/design-consistency-quota-f4f768)
Delivery: commit, then `git push origin HEAD:main` (direct-to-main convention).
Scope: reports/tc-cycle (report.css, report.js, export.js, index.html, pt-br.html).
Constraint: no rendered size may change as a side effect (measure before/after at 1280 and 375 px).

## Status
- [x] 1. Scout: report.css read in full; report.js infrastructure (formatting, tables, card, charts) read
- [x] 2. Audit main() for one-off markup, hardcoded values, duplicated helpers
- [x] 3. Baseline snapshots (HEAD copy in scratchpad/baseline, served by scratchpad/snapserver.py via launch
      config tc-snap on :8772; snap module /baseline/snap.js posts HTML + per-element geometry to scratchpad/snaps;
      baselines base-{en,pt}-{1280,375}; harness proven deterministic)
- [x] 4. Edits: CSS (plan A)
- [x] 5. Edits: JS shared helpers (plans B, C, D, G)
- [x] 6. Edits: main() call sites (plans E, F)
- [x] 7. Validate: node tests pass; snapshots w5-{en,pt}-{1280,375} diffed (only intended changes); every state
      control checked interactively; PNG export checked in-browser (playwright absent, test_export.cjs not runnable):
      widths unchanged (2x of source + 48), surface background, PT labels. Cache-busters -> 20260929-consistency-1.
- [x] 8. Verification workflow wf_65d9d21d-bd2 done (3 agents, 17 findings, all verified inline and fixed:
      card-prob Seed 11; package sentence keeps seed 11; draws/per-draw/seed counts derived; six more titles use
      sided(); dashed/thin legend keys carry colour and weight; premium period uses stateControl; remaining
      equivalent columns use builders; 864e5 left over; icon stroke = --rule non-scaling; numeric day axis uses
      xTicks; one unit rule for table headers; Chart Data export title keeps the side last; two · subtitles)
- [x] 9. README conventions note added; committed and pushed to main (see git log)

## Findings so far
CSS
- Export block at the end of report.css is hand-sized: 14px/12px icon, opacity .5, z-index 100,
  box-shadow 0 2px 12px #0002, font 14px, padding 24px, background #fff.
- Three icon buttons (.copy-link, .export-button in a card title, .site .lang-switch) are three
  implementations of one element.
- .caveat declared twice; .kpi .label listed in both the step -1 and step -2 lists.
- Dead selectors: .asof (h2 .asof), .caveat, .dossier-current, .glossary-grid, .prose-columns, .section-note.
- Markup classes with no CSS: analysis-row--evidence-first, analysis-row--balanced, evidence-drawer.
- .sw.dashed hand-builds the series dash instead of reading --dash-series; the tornado base guide is
  drawn with --dash-guide (.rule) but its legend key is the series dash.
- Header comment says "twelve chapters" (there are 15).
JS infrastructure
- Domain padding fractions differ by chart for one role: lineChart .08, barChart .08, dumbbell .06.
- Tick counts differ for one role: dumbbell 6, rangeChart 5 on the same horizontal value axis.
- svg + legend + tip wrapper and the grid-line group are repeated in all four chart builders.
- 864e5 (ms per day) repeated; 'N/A' literals beside the MISSING constant; `markup` duplicates the
  escape in `tex`; `median` in main() duplicates the median in premiumWindow; CHICAGO_MONTHS duplicates
  the English month names; dumbbell hardcodes the % axis format.
- crossedText hardcodes "52 weeks" while horizonWeeks is derived from R.forecast.

main() and wiring
- Controls: four mechanisms for one job. data-side has its own click handler, aria-pressed sync and focus rule;
  Δ Comparison uses data-comparison with its own handler and re-lists COMPARISONS by hand; sample, horizon and
  tornado build data-state-key attrs by hand; the transferH Horizon control is written twice verbatim.
- KPI markup written out five times; TOC builds executive/chapters/sources twice (select and list).
- Table columns: 125 literal {num: true} columns; redundant `ok(v) ? f(v) : MISSING` around formatters that
  already return MISSING; Quoted spread renders `${fmt(v, 2)}%` (prints "N/A%" when missing); pctTick and
  pctTip are the same function.
- .stale tag written twice (threshold 2 days hardcoded in the Market monitor).
- Card titles place the side five ways ("X: Side", "X (Side)", "Bench Side: X", "X, Side", "Side: X") and
  six titles carry the unit "%" that the anatomy puts in the subtitle.
- "Event Calendar: September 2026 to September 2027" is hardcoded; the rows run from the data.
- export.js joins the context caption with " · " while the page prints "; "; its min width 600, pad 48 and
  #fff canvas are hand values.
- aria-busy is set to false twice (once before the dynamic blocks have rendered).

## Plan (in order; each step diffed against the baselines before the next)
A. CSS: tokenise the export block; one icon-button rule for copy-link, export and lang-switch; remove dead
   selectors, the duplicate .caveat and the duplicate .kpi .label; fix the header comment; legend keys read
   the dash tokens (.sw.dashed from --dash-series, new .sw.guide from --dash-guide for .rule marks).
B. JS preamble: kpi(), stale tag, MISSING everywhere, English month names once.
C. Controls: stateControl() for every segmented control bound to state (side, sample, horizon, tornado,
   comparison); one aria-pressed sync for all state keys; drop the data-side and data-comparison handlers.
D. Charts: shared plot wrapper and grid helpers; one domain padding; one tick target; dumbbell axis format via cfg.
E. Columns: pct/prob column helpers; drop redundant MISSING guards; fix N/A%.
F. Titles: one helper for the side qualifier; units to subtitles; calendar title from data.
G. export.js: separator, geometry and canvas colour from the page.

## Files changed
report.css, report.js, export.js, index.html, pt-br.html (cache-busters), README.md, test_premium.cjs (injects DAY)

## Decisions taken (report these to the user)
- Icon buttons: box = glyph + 2 units, raised half a glyph beside a title, no extra margin: every title icon's
  glyph now sits one unit (4 px) after its text. Card-title export glyph moves ~1 px right, 2 px up (box 14 -> 20);
  chapter copy-link glyph moves 4 px left. At 375 px no title newly wraps (two titles now fit on one line).
- aria-busy: the only success-path "false" fired before the dynamic blocks rendered; now set at the true end.
- .stale tag takes the tight leading so tagged rows are no taller than other rows (was +0.7 px).
- export.js: the file name now uses the same de-duplicated selections as the caption (was repeating title
  words and double time ranges).
- Tables: where a formatter prints the unit (%, pp) the cells carry it and the header does not (14 bare
  percentage columns now print % per cell; 11 headers lost a repeated %; Skill coloured by direction in all tables).
- Legend: dashed and thin series keys now show their own colour and weight (fan chart no longer merges two
  different dashed lines into one key).
- Dumbbell axis: 2.5% ticks printed as "3%" (0 decimals forced); it now uses the line chart's tick precision rule.
- Charts: one domain padding (.08) moves the premium dumbbell's marks slightly; horizontal value axes take
  their tick count from --tick-spacing (dumbbell keeps its 8 gridlines).
- Tornado legend: the base guide key now draws the guide (thin muted dots), not the series dash.
- Market monitor: a reading is stale when older than the latest capture date (the pipeline's and the prose's
  rule); the old table threshold was 2 days, so 1 and 2 day old readings now carry an age tag.
- Titles: the side qualifier is always last in parentheses (34 titles); units moved from 6 titles to subtitles;
  the event calendar title is derived from its rows (Oct 2026 to Sep 2027, was a hardcoded Sep to Sep).
- Seed and paths per seed read from complement.json; the parameter draws and paths per draw are the numeric
  fields probabilistic.spec.draws and pathsPerDraw, set once in complement.py (N_DRAWS, PATHS_PER_DRAW).

## Next step
None: the pass is complete, and the draws follow-up is closed.
