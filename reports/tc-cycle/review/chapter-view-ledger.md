# Progress ledger: one chapter at a time (started 2026-09-29)

Resume rule: read this file first and continue from "Next step". Work is done inline. At most one small
verification workflow runs at the end, and it runs once. If quota runs out, resume from here; never relaunch
from scratch.

Worktree: .claude/worktrees/design-consistency-quota-f4f768 (branch claude/design-consistency-quota-f4f768)
Delivery: commit, then `git push origin HEAD:main`. A parallel session (task_8f07a110) also edits report.js
(the DRAWS/PER_DRAW line), so merge origin/main before pushing.
Request: the report shows only the chapter selected in the sidebar, instead of every chapter at once.

## Status
- [x] 1. Map the architecture: the template, dynamic blocks, notes, hash links, TOC observer, tests' markers
- [x] 2. Design the router and chapter mounting (below)
- [x] 3. Implement (A preamble, B template split, C notes over strings, D show()/route(), E hosts on 44 blocks +
      planCard, seeds/calibration split, F CSS); cache-busters 20260929-chapters-1. Remaining: G tests/README
- [x] 4. Validate: node tests; browser EN + PT at 1280 and 375; every chapter mounts without errors; links,
      notes, dossiers, controls, export and copy-link work; DOM size and render time before and after
- [x] 5. Commit + push; README note (merged origin/main 99cd664; version 20260929-chapters-4)

## Findings
- The whole report is one template literal `let html` (report.js ~1502-2319): hero, KPIs, TOC and report-body with
  17 top-level `<section class="block">` (executive, 15 chapters, sources), then the footer; mounted by root.innerHTML.
- numberNotes() numbers `sup.note` from the DOM in reading order and fills #endnotes (sources page).
- About 55 dynamic blocks after `// ---- dynamic blocks` render into static placeholders: on() blocks, one-shot
  `document.getElementById(x).innerHTML =` statements, bare `{}` blocks, one top-level chart('card-season').
  They throw when their placeholder is absent. Only the block at `on(() => { const s = state.side; const seedRows`
  spans two pages (card-seeds: robustness, card-calib: s06); every other block stays within one page.
- Static tables keep sort/range in tableModels; set() deletes models whose table is not in the DOM.
- In-page links: chapter ids (chapterRef, TOC), #note-n, #dossier-* (rendered by a block into #dossiers), #report.
- The TOC's active state comes from an IntersectionObserver over section.block.
- test_report_findings slices '  <div class="kpis" role="list"' to '  <div class="report-layout">' (keep them in the shell).
  test_export.cjs (Playwright, not installed here) expects #ch-inflation-prices on load and >= 40 exports on one page.

## Baseline (HEAD ea10b18, EN, 1280, hidden pane, iframe probe scratchpad/baseline/perf.js)
- 25,115 elements, 980 svg nodes, 85,259 px tall, ready in 651 ms on the first run (later runs are noisy: 1.3 to 1.8 s)

## Design
- Split the template into shellHead (hero, KPIs, TOC, report-body open), `pages` {id: section html} in contents()
  order, and shellFoot (footer, closes). Mount the shell once and one page before the footer.
- Notes are numbered over the strings (shellHead, pages in order, shellFoot), so the numbers never depend on the page shown.
- on(fn, deps, hosts): a block with hosts runs only while one of them is on the page, and runs when its page mounts.
  One-shot statements become on(fn, [], hosts). Split the seeds/calibration block in two.
- Router on hashchange: a page id, or any static id (index built from the page strings), or dossier-* (the page
  holding #dossiers), or else keep the current page (#report); default page 'executive'. After mount:
  sync static controls to state, restore static tables with non-default sort/range, fit world names,
  normalizeReport, updateTableOverflow, TOC .on / aria-current / select value, selectLinkedWorld, scroll to the target.
- tableModels of tables in the page markup are kept (keep flag) so their state survives page switches.
- CSS: every page opens the body as the executive summary did (no top margin/border on section.block).
- Update test_export.cjs to walk the pages; README note.

## Validation so far
- node tests pass. Every page mounts alone, no errors; each page's markup equals the old full render's section
  (EN and PT, whitespace-collapsed), notes and endnotes included.
- State persists across pages (Δ comparison, static table sort, side); back/forward; #report keeps the page;
  chapter references, note links (with :target highlight), dossier links (world selected, scrolled) and the mobile select.
- Gotcha: the preview's "navigate" to the same path with a new hash is only a fragment change, not a reload. Use
  ?load=N to reload. Setting location.replace inside the hashchange handler is ignored, so it is deferred.

- PT at 375: all 17 pages through the mobile select, no errors, no horizontal overflow.
- Perf (same probe, first load): 228 elements vs 25,115; 2,931 px vs 85,259 px tall; ready ~420 ms vs ~585 to 670 ms.
  The heaviest page (s05) mounts 5,691 elements.
- test_export.cjs now walks every page; its body run in the in-app browser: 70 figures on 11 pages, min width
  1696, max 45 rows, no problems (Playwright itself is not installed here).
- README: one-page-at-a-time note (Edições e convenções) and the export test line.

- After the merge: every page renders on a fresh load, and the draws sentence reads P.spec.draws/pathsPerDraw.
- Router hardening: no decodeURIComponent (a malformed fragment broke the load); page lookups use own keys only
  (#constructor fell through to Object.prototype).

## Next step
None: complete. Possible follow-ups (not requested): previous/next links at the end of a page for phones, where
the index select is not sticky; a print view of the whole report.
