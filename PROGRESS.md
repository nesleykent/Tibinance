# Economic intelligence expansion: handoff ledger

Shared by Claude Code and OpenAI Codex. The latest origin/main commit and this section are the authoritative state.
Plan: `docs/economy-plan.md` (approved 2026-10-13, 15 binding corrections). Release model: `docs/releases.md`.

**Resumption protocol:**

1. Run `git status` and `git fetch origin --tags` (data-release tags point off main and arrive only with `--tags`).
2. Read this section and `docs/economy-plan.md`.
3. Run `git log --oneline -15` and inspect uncommitted changes.
4. Verify what is actually implemented, then continue from "Exact next action".

Never force-push, never reset, never redo finished work.

## Current state

- **Stage:** C (historical gold generation potential). Substep 1, `tools/economy/ingest_killstats.mjs`. The A2
  forecast loop is verified; Stage C0 (benchmark gate) is done, with the decision below.
- **Production:** `release/0003`, a **data release** made by the forecast-archive workflow on top of
  `release/0002`. Live verified: 543/543 files.
- **Exact next action:** implement `tools/economy/ingest_killstats.mjs` to the C0 decision.
  - **Fetch:** shallow blobless clone of each upstream repo pinned at its HEAD SHA, under the ignored
    `.cache/economy/upstream/`, then a batched sparse checkout per month (never per-file lazy fetch).
  - **Partitions:** `.cache/economy/killstats/<world>/<YYYY-MM>.bin.gz`. Each is gzip of a JSON header line plus a
    varint body: per day, per race id (delta-coded), `last_day_killed` and `last_day_players_killed`, with the
    global race dictionary.
  - **Committed:** per world-month digests in `data/economy/sources/killstats.json`.
  - **availableAt** per date comes from the upstream "Add data for date=…" commit times (GitHub commits API).
  - **Upstream rewrites:** commits such as "Retroactively correct names" (2024-01-31, 2024-03-27, 2024-08-02),
    "Backfill data based on new WU2023 entries" (2023-12-05) and the "Mark … as missing data" commits go into a
    reviewed `data/economy/inputs/killstats-corrections.json`, so strict point-in-time mode can flag affected
    dates (correction 11).

## Completed (verified)

- **A0 tooling:**
  - `tools/ci/artifact.mjs`: exact artifact of a commit; digest = SHA-256 of sorted "path TAB sha256" lines;
    excludes `.github/`, `.cache/` and hidden paths.
  - `tools/ci/validate_site.mjs`: unit tests, builder `--check`s, forecast-archive check once it exists, local
    reference check.
  - `tools/release.mjs`: `--full` / `--data` / `--status` / `--verify`; hash-chained `release/releases.jsonl`;
    atomic tag + main push built on remote main; never force.
  - `tools/ci/pages_release.mjs`: resolve, build, verify-live, parity.
  - `tools/ci/run_research_tests.py`: skips only the test that needs the ignored `.openai/hosting.json`.
  - Release 0001 created and pushed with the tool (`47958b6`, tag `release/0001` → `b7eb0e4`, artifact digest
    `d3afc57aad80faa830441c9350eb84aa9890754edae88ec091f3738c5c36a343`, 495 files).
  - Fix after release 0001: the local branch now follows the release commit when `--with` files were dirty with
    the committed content (before, it stayed behind). Covered by a 12th release test.
  - `release/policy.json`: data-release paths.
  - `.github/workflows/ci.yml` and `pages.yml`.
  - `docs/releases.md`.
- **A0 acceptance (2026-10-13), all passed:**
  - **Isolation test:** checkpoint `218d6f8` edited a served file (`css/site-header.css`). Results:
    - no Pages run started (only CI);
    - no new github-pages deployment;
    - live still equals `release/0001` 495/495, and the live CSS lacks the new comment;
    - `release.mjs --data HEAD` was refused as "nothing to release", with no tag created.
  - **CI on `218d6f8`:** success. Research 39 run with 2 skipped (hosting, exact-float variant); Site integrity
    7/7; release verify 1 release consistent.
- **A0 bootstrap results (2026-10-13):**
  - Release 0001 dry run (run 38464936631, Pages still legacy): validate and build passed, deploy skipped.
  - The downloaded artifact equals `release/0001` file for file (495/495). Live then differed only in
    `PROGRESS.md`, which branch deploy had republished from newer commits; it is a served doc, not site UI.
  - The Pages source was switched to GitHub Actions. Release 0001 was deployed (run 38465232067, deploy job
    success), and live equals the release 495/495.
  - A legacy "pages build and deployment" run queued before the switch also finished afterwards; live content was
    re-verified as release 0001 after it.
  - Rollback path (documented in `docs/releases.md`): switch the Pages source back to the branch. Not needed.
- **CI on GitHub:** Site integrity passes. Research failed only `test_inflation`'s bit-exact reproduction of
  `inflation.json`: other machines' BLAS changes the last float digits (Linux x64 and GitHub macOS arm64 alike),
  while it passes on the producing machine. CI sets `TIBINANCE_FLOAT_TOLERANCE=1`. `tools/ci/run_research_tests.py`
  then runs that test body with only the top-level equality relaxed to 1e-9 relative on floats, and every other
  assertion exact. The exact variant runs locally (verified 38/38 with `hosting.json`; 39 run, 1 skipped in
  tolerance mode). The Research tests themselves are unchanged.
- **Tests (local, 2026-10-13):**
  - `node --test tests/*.test.mjs`: 150 pass (138 existing + 12 new in `tests/release.test.mjs`).
  - `node tools/ci/validate_site.mjs`: all checks PASS.
  - Research suite via `tools/ci/run_research_tests.py` with the pinned venv: 37 pass, 1 skipped when
    `hosting.json` is absent (38/38 with it).
  - `reports/tc-cycle/validate.py`: PASS (ledger untouched: 5 frozen forecasts).

- **Stage B so far:**
  - `tools/forecasts/archive.py` (stdlib only): `--ensure`, `--backfill <rev>`, `--check`, `--reconcile <rev>`.
    - Content-addressed objects live in `data/forecast-archive/objects/`.
    - `publications.jsonl` is hash-chained, and every record has a `contentHash` that excludes the archival event.
    - The validator runs `--check` whenever the archive exists.
  - Backfill of `origin/main`'s first-parent history produced 17 records:
    - 6 `tc-world-scenarios` editions: 2026-09-28; 2026-10-02 twice, with a supersession (`2ae4607` →
      `f885548`); 2026-10-03; 2026-10-04; 2026-10-05.
    - 5 `research-ledger` forecasts, imported read-only by seq and hash; the ledger file is untouched.
    - 5 Markets projections presentations.
  - Timestamps:
    - createdAt for scenarios is "not recorded", bounded by the first commit that holds the edition (basis
      stated).
    - Ledger createdAt = `recordedAt`.
    - archivedAt = backfill time, basis `backfill`.
  - `tools/forecasts/reproduce.py --all` (needs numpy): all 6 editions rebuild from their input snapshots to
    ≤ 4.4e-16 relative. Prediction reproducibility is verified.
  - The archive is 1.1 MB.
  - `tools/forecasts/test_archive.py`: 12 tests, all pass (with numpy; 10 pass and 2 skip without it). They cover:
    - idempotence and identity across machines;
    - supersession;
    - tamper detection and object immutability;
    - `--check` failing on unarchived representations and on projections from other results;
    - reconcile;
    - the read-only ledger import;
    - preserved inputs;
    - reproduction, including detection of a changed input.

    CI runs them plus `reproduce.py --all`.
  - `tools/forecasts/publish_evidence.py` appends publication evidence; `tools/forecasts/index.py` derives
    `index.json`, whose freshness `--check` verifies.
    - **Repository evidence** is the earliest listed moment main's actual head held the content. Push events are
      exact. Legacy Pages builds of main count as "no later than". Pushes whose previous head already held the
      content count only as an upper bound. Before the listed period, the committer date is a stated lower bound.
    - **Website evidence** comes from successful Pages deployments. Legacy builds served main's commit; "Pages
      release" serves the release commit named by `release/production.json` at the deployment's commit.
      Failures are recorded separately.
    - **Results on the real archive** (54 records): every edition is published at website level, with repository
      time ≤ website time.
    - **One projections version stays `archived`:** `276fca5`, a 2026-10-03 presentation that existed only on a
      branch commit merged as a first parent, so it was never served.
    - `pages.yml` now checks out `github.sha`, so each deployment maps to the release manifest it deployed.
    - `test_publish_evidence.py`: 6 tests (archived without evidence, repository then website, failed deployment
      after archival, upper bound, committer-date fallback, release tree vs main). All 18 forecast-tool tests
      pass.
  - `tools/forecasts/evaluate.py` (needs pandas) scores closed target weeks with the Research's own
    `build_daily` and `weekly_series`.
    - Observations come from the Research and Markets TibiaMarket copies (merged by timestamp; conflicting rows
      fail) plus `data/observations.json` and validated manual files. One observation-dataset object per run is
      cited by every evaluation.
    - It appends to `evaluations.jsonl` (hash chain). A changed actual appends `evaluation-superseded` and keeps
      the old score.
    - **Current run:** observation cutoff 2026-10-05, 0 scorable. The earliest target week ends 2026-10-11, so all
      27,928 points are correctly awaiting observation.
    - Scoring starts once observations pass 2026-10-11: TibiaMarket sync (A2) or a screenshot update.
    - `test_evaluate.py`: 7 tests (Mon–Sun target week, weekly median of daily medians, captures only fill missing
      days, unclosed and empty weeks not scored, idempotent re-run, supersession keeping the old score, zero
      actual, forecast chain untouched). Forecast-tool suite: 25 tests, all pass.
  - Atomic hook: `tools/build_market_projections.mjs` writes `<file>.pending`, runs
    `archive.py --ensure --projections <pending>` and renames only after success. `tests/forecast-archive.test.mjs`
    proves a failing archive leaves the projections untouched. The Research README order now includes
    `archive.py --ensure` after `ledger.py`.
  - `tools/forecasts/publish.py`, the transaction:
    1. Take the lock, archive with `--ensure`, and check the ledger prefix.
    2. Refuse if main changed a non-archive unit file.
    3. Reconcile the chains by `contentHash` (main's records first, plus the objects they cite) and rebuild the
       index.
    4. Run `--check` on the working tree, build the commit on the remote main with plumbing, and run `--check`
       again on the commit's own tree.
    5. Push without force (retried on rejection), then fast-forward locally.
  - `test_publish.py`: 8 tests on throwaway origin and clones, including a rejected push followed by an
    idempotent retry and two concurrent publishers. Forecast-tool suite: 33 tests pass. JS suite: 151 pass.
  - `index.json` now summarises the evaluation in force per target week (n, MAPE, bias, coverage). Points stay in
    `evaluations.jsonl`.
  - `js/forecast-archive.js` (pure, no DOM) provides:
    - `weekEnding`; `publishedAt` (website evidence first, repository as a labelled fallback, archived never);
    - `classify` and `lifecycleLabel`;
    - `publishedBy` and `editionAsOf`, which show only what was public at t, newest publication first;
    - `scenarioSeries` and `sameTarget` (several editions' forecasts for one target week, with horizons);
    - `evaluationPoints` (superseded evaluations out of view);
    - `metrics` (MAE, RMSE, MAPE, sMAPE, bias, coverage; a zero actual is skipped) and `groupMetrics`;
    - `readObject` (gzip objects via `DecompressionStream`).

    `tests/forecast-archive.test.mjs` has 7 tests. JS suite: 157 pass. Forecast-tool Python: 34 pass.
  - **A2 so far:**
    - `tools/sync_tibiamarket.mjs`: one `world_data` request. Only worlds whose source update is newer than every
      copy we hold are refetched. A new copy is written only if it keeps every held row unchanged; otherwise it
      is reported as a conflict.
    - `tools/sync_market.mjs`, the shared update path: fetch, history, audits, projections (archived first),
      evaluate, validate, `--publish` through `publish.py`, `--release` as a data release.
    - `data/economy/sync-status.json` records each source's last data change and freshness. It is written only
      when something changes.
    - **TibiaMarket finding (2026-10-13):** of 113 worlds, most were last updated 2026-08-28 to 2026-09-15; Monza
      2026-09-26; Antica 2026-10-06; nothing since. Evaluation therefore waits for screenshot updates or for the
      source to resume. The first target week closes 2026-10-11.
    - `tests/market-projections.test.mjs`: the logic tests now use the Research anchor observation, so they hold
      when Markets is newer. The freshness test became "each anchor is a real Markets observation, shown exactly
      while it is the latest".
    - `tests/market-projections-browser.mjs` now opens Antica while its projection is placed, otherwise the
      placed world with the longest history (Secura today). It checks that a waiting world says it waits, and
      that an active world's axis runs to the market history's last server day (`index.through`), with projected
      weeks read after it.
    - **Browser suites in Chrome (2026-10-13, threaded local server):** all 12 pass (Markets, projections,
      Screener, Events, Events panel, global, canonical Events, Statistics, tables, Trade, TIB, site header).
    - `tests/sync-tibiamarket.test.mjs`: 2 tests.
    - Workflows:
      - `.github/workflows/market-daily.yml` (18:40 UTC daily and on dispatch) runs `sync_market.mjs --fetch
        --publish --release --dispatch`.
      - `.github/workflows/forecast-archive.yml` (on pushes of representations or market data, on deployment
        status, at 06:20 UTC and on dispatch) runs `archive --check`, `publish_evidence`, `evaluate` and `publish`,
        then a data release.

      Both share the `data-writers` concurrency group. `release.mjs` exits 3 for "nothing to release", which
      automation treats as success.
  - **A2 verification on GitHub (2026-10-13):**
    - `market-daily.yml` run 38471257451: success. Nothing due, nothing to publish, nothing to release
      (idempotent).
    - `forecast-archive.yml` run 38472554608: success. It added repository and website evidence for the new
      projections version, published `44f3231` and made data release `release/0003`; the bot-dispatched Pages
      deploy succeeded and was verified live 543/543.
    - Rerun 38472933229: 0 evidence, nothing to publish, nothing to release (idempotent).
- **Stage C0 benchmark (2026-10-13), decision recorded:**
  - **Fetch:** a shallow blobless clone of the archive repo takes 1.6 s and 2.5 MB (tree only; 102,891 world-day
    files). Lazy per-file blob fetch is unusable (~20 MB in 10 min). A batched sparse checkout of one week, all
    worlds (609 files, 117 MB JSON), takes 3.3 s, so about 10 min for the archive.
  - **Parse:** 430 MB/s, so the full 19.8 GB of JSON costs under 1 min of CPU.
  - **Rows:** about 91 M non-zero archive rows (plus about 27 M current).
  - **Formats** (full-archive extrapolation): NDJSON+gzip 413 MB; columnar varint+gzip 178 MB; +zstd 172 MB (no
    real gain, extra dependency). **Choice:** columnar gzip (standard library in Node and Python).
  - **Actions limits:** well within the 10 GB cache and 6 h job limits. A full rebuild needs about 20 GB of
    transient disk if fully checked out, so it processes month by month and deletes each month's checkout.
  - **Upstream has 1,193 + 312 daily commits**, plus correction and backfill commits listed above.
- **A2 so far:** wrote into the working copy of the real archive, because default
    arguments bound the paths at import. The 5 stray records (basis `test`) and 4 objects were never committed;
    they were removed and the committed archive was restored. Paths now resolve at call time, and the test class
    asserts that the repository archive is byte-identical afterwards.

## In progress / remaining

- A0 steps 3–8 (release 0001, dry run, parity, activation, live verification, isolation test).
- Then Stages B, C, D, E, F, G, A2, H per the plan. Frequent checkpoints start after A0 step 8.

## Unresolved requirements (carried, not substitutes)

- GuildStats historical hourly online data: blocked by Cloudflare challenges for scripts. No circumvention. Legitimate
  routes: Wayback snapshots (sparse, labelled), operator permission.
- TibiaVIP active population: same blocker. The user's PDF (2026-10-13) holds "total known characters" only.

## Decisions (do not reopen)

- Economy is the 5th site section. Forecast history is a Markets dock panel.
- Production is isolated from checkpoints via releases (`docs/releases.md`).
- Forecast archive is append-only with transactional publication. `reports/tc-cycle/forecast-ledger.jsonl` is never
  modified.
- Terminology: `directCoins`, `npcPotential`, `grossPotential` from valued creatures. No liquidation rate is assumed.
  The three are never all regressors together.
- Point-in-time vs latest-evidence reconstruction; `effectiveAt` ≠ `availableAt`.
- No republishing of the tibiamaps kill-stats archive. No agent swarms.

## Files created or modified in this expansion

- `tools/ci/` (new), `tools/release.mjs`, `tests/release.test.mjs`, `release/policy.json`, `.github/workflows/`
- `docs/economy-plan.md`, `docs/releases.md`, this section

## Long-running jobs

None.

---

# Apple Vision review progress

Branch main; restore coverage lost in 2ae4607. No agents launched or restarted. Preserve unrelated tools/validate_archive.py. User confirmed two 2024 historic captures belong to Gentebra.

COMPLETE: all 107 nonaccepted screenshots diagnosed using Apple Vision/Tesseract; 67 complete native readings and four visually verified corrections recovered 71 captures. Final targeted pass completed using existing raw checkpoints and unchanged chronological mixed stream. Root fixes: selected-item crop recheck, original-colors Items/Search sidebar reread, removal of arbitrary ten-row cap. No UI, schema or metric changes.

VALIDATED: 1502 files /1501 images, 426 eligible, 0 duplicates, 390 accepted (388 Offers +2 Statistics), 6659 offer rows /4767 identities, 40 worlds, no pending review/runtime failures. 28 no-Market +3 other-item +5 explicit visual exclusions (two Offer History, combat, Task Board, cursed coin). All 319 previously accepted records/clocks/quotes/UUIDs retained; all 288 pre-rebuild hashes restored; Unebra6→7, previously0. Two Statistics captures unchanged. Anonymous review audit published in data/rebuild-vision-review.json.

BACKUPS: ignored data/rebuilt-market/20261002-vision-review/canonical-before-review.tar.gz and 15-file backup manifest; original 426-event run remains in 20261002-statistics-v6. Final pass checkpoints/logs retained locally, no raw OCR/images/private metadata published.

INSTALLED: validated canonical JSON/CSVs and anonymous rejection/validation audits. market_update.py accepted390 captures/40 worlds and installed byte-identical canonical data.

VERIFICATION COMPLETE: 47 JS tests, all58 tools tests including real Details website/Python parity, all34 report tests, validate.py --reproduce (40 worlds/386 research Offers/4160 forecasts; complementary output byte-identical), report Node204 comparisons/findings/compatibility. Canonical website import390/6659 exact and idempotent. Actual EN/PT reports40 worlds including Unebra,4 Statistics side rows, raw Statistics counters (the historical ×25 interpretation was corrected by the market-metrics audit), responsive controls. All71 exports per language passed at2x with complete tables/PNG download. Real Offers/Details OCR/review/save/export tests passed. All28 Market exclusions additionally visually checked; no Market view. Privacy16 outputs and frozen inputs/ledger checked; final validation against recoverable prior319-record backup passed. Frozen inputs/ledger/order and generated site package equality confirmed.

REGENERATED: results, complement, inflation JSON/monthly/annualCSV, lifecycle, robustness and dist site package. Forecast ledger remains unchanged (2 frozen forecasts,0 scored weeks). Canonical processing-order unchanged. Anonymous107-case recovery audit contains final world coverage and every rejection reason; no names/images/raw OCR published.

DELIVERY: intended code/data/docs only; tools/validate_archive.py remains unrelated and untracked. Publish this final verified revision directly to main and verify the remote hash. The final task response records that commit. No extraction, review, report calculations or validation need to be repeated; all work is complete.

## Details review follow-up

Root cause reproduced on real capture in WebKit: all eight numbers were correctly read, but crop resampling read the title as SLatIstICcS; requiring that title a second time discarded all fields. Chrome previously passed. Fixed shared reader to trust its verified Statistics pane while requiring exact side/field labels, numeric confidence and agreeing OCR values.

Missing fields now carry extraction-specific review reasons; incomplete reads do not enter the value-validation stage. Readable partial fields remain editable. Statistics values require safe nonnegative integers; the later semantic correction removes the unsupported TC quantity derivation. Schema, layout, clocks, confidence rules and canonical data unchanged; no historical processing repeated. Python sanitized review feedback preserves extraction-specific failure categories without raw OCR/private errors.

Verified49JS tests,59Python tools tests including real Details parity,5 downstream schema tests and market-update390/40 compatibility. Real WebKit/Chrome Details populate all8 values; real20-row Offers regression, forced OCR failure, manual recovery, JSON/CSV persistence and responsive EN/PT report fixtures passed. Site package refreshed with shared runtime. Final WebKit reprocess with existing Gentebra context passed: all8 fields,84900/152050TC,enabled save; screenshot inspected and original layout retained.

Complete: final diff/syntax checks passed. Publish this verified follow-up directly to main; final task response records the commit. Canonical data and generated numerical reports remain unchanged. Preserve unrelated tools/validate_archive.py.

## Compact saved Statistics table (presentation only)

COMPLETE: saved Statistics now occupy one row per capture with grouped Sell Side / Buy Side / Data headers, five compact metrics per side, full-name/unit tooltips, capture/hash/removal at the right. Database columns now place Type/BattlEye under Data after Spread; existing visibility keys, filters, sorting, expansion and deletion handlers retained. Shared table styles and separate horizontal scroll containers reused; no data/schema/calculation/timezone/export changes or reprocessing.

VERIFIED: 49 JavaScript tests passed. Permanent real-record browser regression passes Chrome and WebKit: distinct Sell/Buy values, timestamp precision/context, hashes, column preferences across reload, group spans, sorting, expansion, world/range filtering, unchanged storage/JSON exports, exact-hash removal and 1440/768/390 responsive layouts. Screenshots inspected outside repository. Browser plugin not available; existing Playwright workflow used. Files: index.html, js/app.js, css/app.css, tests/tables-browser.mjs, README.md, this ledger. Preserve unrelated tools/validate_archive.py.

COMPLETE: existing Chrome ingestion/storage/responsive browser suite and WebKit Statistics CSV/EN-PT report regressions also passed. Final diff reviewed; canonical datasets and report numerical outputs remain untouched. Next step: commit/push only the six intended presentation/test/documentation files to main; report the resulting commit hash.

## October 3 screenshot update and independent review

PHASE 1 COMPLETE: independently inspected all eleven screenshots marked during the run before changing extraction. Original Market context and numeric zooms supplied the transcriptions; Tibinance output was compared afterward. Final comparison: 572 matching fields, 49 differences including one spurious row, no unresolved visual ambiguity. Three draft transcription errors in case 9 were corrected by fresh original-pixel zooms; those three fields were already correctly extracted. Anonymous per-case ground truth, pre-fix extraction, matches, differences and root causes are in data/market-update-review.json. Filename mapping/full-window privacy previews remain local and ignored. No image-specific correction file was applied.

PHASE 2 COMPLETE: physical numeric text bands prevent tall-token row bridging and missing-row index shifts; separate row/cell reads validate integer/checksum consistency; complete expiry text bounds plus agreeing reads prevent clipping/guesses. Statistics title recovery stays inside the verified pane, and field-label glyph height avoids inflated-title crops into adjacent UI. Anonymous world/time context is checkpointed before value OCR; failed-worker cleanup releases the queue. Reused local Chrome OCR sessions still sometimes close; isolated processing resolves runtime failures without treating them as OCR evidence.

DATA VALIDATED LOCALLY: 1656 files/1655 images, 543 eligible copies, 503 unique eligible hashes, 40 duplicates. 467 ready (427 Offers/40 Statistics), 7419 offer rows/5433 identities, 40 worlds, 0 pending/0 runtime failures. Historical 28 no-Market, 3 other-item and 5 explicit exclusions retained. All 390 previous captures, clocks, worlds and offer identities retained. Added 77 captures. All 467 anonymous contexts saved in the ignored update archive. Canonical JSON/CSVs and anonymous processing/rejection/validation audits installed locally; market-update.json is byte-identical. Markets history regenerated deterministically: 116 total history worlds, 13240 observations, 465 converted capture observations under the unchanged spread policy. Frozen research/history inputs unchanged.

BACKUPS: data/rebuilt-market/20261003-update contains canonical-before-install.tar.gz, SHA manifest, immutable pre-fix audit, manual/private reviews, original-image diagnostics and contexts. Raw screenshots unchanged and ignored. Public review previews expose no owner/character names. Private source-identifier scan passed. The unrelated Tibinance_Roadmap.md remains untouched.

VERIFIED: 79 JavaScript tests, 59 Python tools tests (one optional real-browser test skipped), eleven original-image canonical regressions in WebKit queue and isolated Chrome, two historical extraction controls, actual canonical 467-record/7419-row storage equality and idempotent import, saved Statistics/Offers controls and responsive layouts, Markets and merged shared-header WebKit browser tests. EN/PT reports render 40 quote worlds and all 80 Statistics side records with exact raw Statistics values (the historical ×25 interpretation was corrected by the market-metrics audit) and working controls. Node report comparisons/findings/compatibility passed. Concurrent main header commits merged without rewriting history; extraction commit f627eb2.

FINAL VERIFICATION COMPLETE: the initial external environment mismatched requirements.txt and reproducibility correctly failed. Its uncommitted forecast/program/output draft was archived locally, preserving both published records. The ignored project .venv matches all four exact pins. Full analysis, sensitivity and 37 report tests pass; validate.py --reproduce confirms byte-identical complementary output, 40 modelled worlds/425 research Offers/4160 forecasts, source hashes, temporal bounds, arithmetic and robustness. Only after validation was the October 3 forecast frozen: three forecasts/zero scored weeks, prior ledger prefix unchanged. Documented process now runs tests and reproduction before ledger freezing. The unchanged simulator passes same-seed, different-seed and pinned-dependency regressions. Final package equals every public asset and merged shared header; frozen inputs unchanged. Final private-name scan passes all task public files. Final pinned-output EN/PT browser checks passed: 40 quote worlds, 80 exact Statistics side records, raw Statistics counters (the historical ×25 interpretation was corrected by the market-metrics audit), controls, and responsive rendering. All verification is complete. Commit/push the reviewed data/docs/tests directly to main and verify GitHub Pages; the final task response records the remote commit.

## October 4 Chrome batch isolation investigation

COMPLETE: no cross-image OCR, geometry or context contamination found. Reused batch means Node/Chrome/context/page reuse; canonical ingestion already serializes readers, creates a new bitmap/context/result, and awaits worker termination per image. Shared Chrome, fresh-page and fresh-context experiments all close during the second image; that image passes alone. Blank-page controls with no application or OCR also exit after about 32 seconds (32,134 ms launchServer; 32,151 ms direct production launch), establishing that screenshot reuse is not necessary. Chrome exits with code 0/no signal; native shutdown cause remains unresolved. Extraction and browser lifecycle implementation unchanged; README limitation clarified and docs/ocr-batch-isolation.md records evidence and limits.

VERIFIED: default real-image regression now mixes eleven originals, two historical controls and a repeated first image. Exact values pass shared WebKit and isolated Chrome; fresh-worker creation/disposal is asserted, with all six context fields checked in the shared sequence. New success/failure cleanup-blocking test preserves distinct second-image metadata, geometry context and rows; removing the cleanup await in a temporary copy makes it fail. 80 JavaScript tests pass; Python tools 59 run/one optional skip; pinned research 37 pass; validate.py --reproduce and deterministic history checks pass. Research arithmetic/findings/compatibility checks pass. Chrome export test is interrupted by the independently reproduced shutdown; unchanged export assertions pass all 142 EN/PT figures in WebKit. All 405 baseline public data/report files are SHA-256 identical, including all 467 captures, frozen inputs, published results and forecast ledger. No affected published capture identified. Private originals/logs stay local and ignored; unrelated Tibinance_Roadmap.md preserved.

MARKET-METRICS SEMANTIC CORRECTION: removed unsupported Statistics ×25 derivation from normalized captures, history, review, Research and exports. Markets now plots raw daily transaction activity; rolling last-30-days counters remain separate. Captured Buy/Sell offer depth and quoted gold notional keep their original values and separate sides. Legacy tcVolume is accepted but ignored and omitted from new public/export contracts; source archives remain intact. Structural comparison against the previous dataset preserves all 467 captures and every counter, offer, price, timestamp, identity and analytical result. Verification: 85 JavaScript tests, 59 tools tests (one optional original-image browser check skipped), 38 report tests, Chrome/WebKit tables/Statistics/Markets checks, EN/PT report findings and compatibility, 204 comparisons, generated-history check and report reproducibility. All 71 figures per edition rasterized/exported successfully. No upstream board API or traded-TC estimate was added.

INTEGRATION VERIFICATION: merged concurrent main changes without rewriting history. Preserved the incoming Markets workspace layout while plotting raw activity counts; kept the new Trade calculator's independently valid 25-TC offer increment separate from Statistics metadata. Full merged JavaScript suite passes 99 tests; merged Markets passes Chrome/WebKit with actual image exports, and Trade passes Chrome input/rule/responsive checks. Report reproducibility and all 71 EN/PT exports passed. Structural preservation checks still pass against the original dataset.

## October 4 screenshot update

COMPLETE: 1681 files/1680 images; 568 eligible copies, 528 unique, 40 duplicates. The canonical runner reused the 503 version-6 checkpoints (each passed duplicate preflight) and read the 25 new 2026-10-04 Hotkey captures in isolated browsers: all ready, no review, no runtime failures. The 36 other 2026-10-03 files are Tibia's automatic screenshots (SkillUp, TreasureFound...) and fail the filename filter by design; the one 2026-10-01 file with an underscore in the character field is filename-rejected and shows a silver token, not Tibia Coins. 492 captures (440 Offers/52 Statistics), 7678 offer rows/5525 identities, 40 worlds.

IDENTITIES: a first finalize without the previous enriched dataset reallocated 354 offer UUIDs of existing captures; it was discarded. Finalizing with data/observations.json as observations-enriched.json leaves all 467 earlier records byte-identical. validate_rebuild.mjs with the previous dataset and review decisions passed every check; outputs passed a scan for all screenshot character names and filenames.

INSTALLED: data/observations.json, observations.csv, offer-observations.csv, market-update-processing-order.json, market-update-validation.json (rejections unchanged, review unchanged); reports/tc-cycle/market-update.json via market_update.py (byte-identical). Rebuilt Markets history, overview, rolling-activity and chart-integration audits, projections (40/40 anchors equal Markets' latest offers). Research regenerated with the pinned .venv: 38 tests, validate.py --reproduce, ledger.py froze cutoff 2026-10-04 (4 forecasts), validate.py, node report checks. Archive and pre-install backup: data/rebuilt-market/20261004-update (ignored).

VERIFIED: 141 JavaScript tests and 11 Chrome browser suites, all first run, against a threaded local server with a large connection queue: Python http.server's queue of 5 reset module requests and caused the day's intermittent first-load timeouts. The Markets entry now reports a failed module load instead of loading forever. WebKit not run (installed Playwright expects an absent WebKit build).

## October 5 screenshot update

COMPLETE: 1786 files/1785 images; 621 eligible copies, 581 unique, 40 duplicates. The canonical runner reused the 528 version-6 checkpoints and read the 53 new Hotkey captures in isolated browsers: 52 Tibia Coins captures (26 Offers, 26 Statistics; two of 2026-10-04, 50 of 2026-10-05) ready and one no-Market, no review, no runtime failures. 544 captures (466 Offers/78 Statistics), 8193 offer rows/5945 identities, 40 worlds.

IDENTITIES: finalized with data/observations.json as observations-enriched.json; all 492 earlier records are byte-identical. validate_rebuild.mjs with the previous dataset and review decisions passed every check; outputs passed a scan for all screenshot character names.

INSTALLED: data/observations.json, observations.csv, offer-observations.csv, market-update-processing-order.json, market-update-validation.json; reports/tc-cycle/market-update.json via market_update.py. Rebuilt Markets history, overview, rolling-activity and chart-integration audits and projections. Research regenerated with the pinned .venv: 38 tests, validate.py --reproduce (464 research captures), ledger.py froze cutoff 2026-10-05 (5 forecasts), validate.py, node report checks. Archive: data/rebuilt-market/20261005-update (ignored).

PROJECTIONS: the Research cutoff (2026-10-05) is now a day after Antica's last observation (2026-10-04), so Antica's quote is stale and its confidence limited, the first projected week ends 2026-10-12, and 2026-10-05 falls in no projected week. Tests were updated to these values; the browser test reads Antica's stale flag from the data.

VERIFIED: 138 JavaScript tests; Chrome browser suites (Markets, Screener, Events, Events panel, Global, Projections, Canonical Events, Statistics, Tables, Trade, TIB, site header) against a threaded local server. browser.mjs and WebKit runs need absent Playwright browser builds; the OCR and Vision review suites need private archive variables.
