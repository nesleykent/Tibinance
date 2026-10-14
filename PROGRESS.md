# Economy as a terminal, 2026-10-14

- **Instruction:** the user compared the Economy page with Markets ("your page are incomplete! look how the [Markets]
  page are") after the UI hold above. I took that as a new instruction to resume Economy UI work.
- **Change:** Economy is rebuilt as a terminal in the Markets idiom, on Markets' own layout and components
  (`css/markets.css`, `js/markets-dock.js`), with no new tokens (`css/economy.css` defines none):
  - **Chart:** a status block with the world, its facts and its quote, a Gross, Coins or NPC picker, and the readout
    under the crosshair. A short kills pane sits under the gold. Ranges run 1M to All, with D, W and M intervals.
  - **Dock:** a Worlds watchlist (active worlds; retired ones when a search names them, marked R; low coverage
    marked i) with details and performance; Creatures (a month's top 30); Assumptions (liquidation rate, constant
    creature set; dashed and labelled); Research; Help with method and sources.
  - **Rail:** the TC Sell Offer on a left scale, image export and full screen.
  - **Gold per day:** every figure is gold per day, so the intervals share one scale. Only complete periods have
    values (`ratePeriods`, `rangeChange` in `js/economy-data.js`), and the audited arithmetic from 448f613 is kept.
- **Overview:** the watchlist reads `data/economy/gold/overview.json`. `tools/build_economy_overview.mjs` builds it
  with the chart's own functions, so a world's row equals its chart for every interval, measure and range. It runs
  as a builder `--check` in `validate_site.mjs` (now 9 checks) and after `build_gold` in `economy-daily.yml`.
- **Tests:**
  - `tests/economy-browser.mjs` is rewritten for the terminal: every figure is recomputed from the data, and the list
    must agree with the chart at each interval and measure. It passes in Chrome.
  - 3 new unit tests (209 of 209 pass).
  - The header test's Economy ready check is updated and passes.
- **Release:** the user chose to release main as it is. That shipped the Economy terminal and the other agent's
  previously held Markets changes (Forecast history controls and fixes, the Events toggle convention).
  - **Before:** all Markets, Forecast history, Projections, Events, Screener, Tibia Token, Trade and canonical-events
    browser suites passed in Chrome on f2354f2, and CI was green.
  - **Production:** `release/0006`, a full release of f2354f2 (928 files). The Pages run deployed it, and
    `verify-live --all` found 928 of 928 live files equal; one file was briefly stale at the CDN on the first check.
  - **Live check:** the Economy page loads with 96 worlds, and Antica's row equals its chart (2,547,386,519 per day,
    +78.95% 1Y).
  - **The UI hold is lifted** by this instruction.

---

# Economy automation verified, 2026-10-14

- **First `economy-daily.yml` run** (38506418523, cold cache): every step succeeded.
  - It rebuilt all 51 kill-statistics months for 159 worlds: 601 days recovered exactly, 0 conflicts.
  - It committed `data/economy` through the kill-statistics files of 2026-10-13 (f9f5d13).
  - It made the data release `release/0005`.
- **Live check:** `node tools/ci/pages_release.mjs verify-live --all` passes, with 924 of 924 live files equal to
  `release/0005`. A first check found one differing file and the next three found none: a CDN edge served one stale
  copy.
- **Gold challenger: not yet run.** That run started before the challenger step existed. The step is in
  `economy-daily.yml` on main, so the next scheduled run (03:30 UTC) is the first to archive a `tc-gold-challenger`
  edition. Check that it archives exactly one edition through `publish.py`, and that a rerun archives nothing.
- **Unchanged:** this entry changes no code, data or release. Production stays `release/0005`. The UI rebuild on
  main stays unreleased, as recorded above. A full release of main would deploy it, so none is made without a new
  user instruction.

---

# Authorized authorship history rewrite, 2026-10-14

The user explicitly authorized rewriting existing bot-authored commits and release references after the bot
identity was removed from all four writing workflows. This is the specific exception to the standing prohibition
on history rewrites and moved release tags; ordinary publication continues to prohibit force-pushes.

- Seven bot author/committer identities corrected to `nesleykent <nesleykent@icloud.com>`; 30 commit IDs changed
  including descendants. All original commit trees, messages and author/committer timestamps are preserved.
- `release/0003`, `release/0004` and `release/0005` receive updated annotated-tag objects and commit targets;
  release 0001/0002 are unchanged. Tag annotations identify their corrected target and retain their original dates.
- `release/identity-rewrite.json` records the audited old/new commit IDs and identical tree hashes. Release and
  forecast readers resolve only this explicit map and reject a different tree. Published release records,
  forecast records, snapshots and all existing dataset files remain byte-identical; hash chains are not rewritten.
- The approved production remains release/0005, artifact digest
  `ec8fcf0f3aa045cac6857421711b024d6fff7628c0dba461ec768c3e9edc463d`. No release or deployment is requested.
  The rejected UI work remains unreleased and must not be resumed or deployed without a new user instruction.
- A complete pre-rewrite bundle was saved before any ref mutation. SHA-256:
  `7f0789f124c25f2f22cf67e132168e3d51be12fd0d7691870fe68f6fe6739544`.
  The calling checkout keeps a private copy under `.git/identity-rewrite-backup.bundle`; it is never published.
- Validation in a fresh clone containing only rewritten reachable history: all original trees compared; no bot
  identities in reachable authors/committers; all five release digests and chains valid; six forecast editions
  reproduce; archive integrity and Research invariants pass. New regression cases preserve release records,
  resolve old source IDs, reject changed trees and use the corrected parent for future data releases.

Completed: the reviewed rewrite and compatibility tools were published atomically with exact old-ref leases.
GitHub's branch/tag targets match the audited replacements, and its contributors API now lists only `nesleykent`.
Both remote CI jobs passed. GitHub automatically redeployed the existing release/0005 after the force-push;
it completed before cancellation was possible. Its artifact digest is unchanged, and all ten live-file checks
match release/0005. Forecast upkeep passed without adding records, commits or releases. The rejected UI remains
unreleased. No further implementation or deployment is requested.

---

# Automation authorship correction, 2026-10-14

The user cancelled further UI work and requested removal of the Tibinance data bot identity.
The UI rebuild is committed on main as `ccb9ab1`, but is **not released**; no full release was created.
Do not resume or deploy that UI work without a new user instruction.

The four writing workflows (economy data, market sync, forecast archive and online sampler) now use the
repository owner's existing commit identity, `nesleykent <nesleykent@icloud.com>`, for author and committer.
Workflow names and messages still identify automated data updates. CI-only throwaway fixture identities are
unchanged because they never author repository commits. Existing published commits/tags have not been rewritten.
Removing the old identity from historical GitHub commit records requires a separate history rewrite, including
release references, and conflicts with the standing no-history-rewrite/no-force-push rules.

Verification: all four writer configurations inspected; no bot identity remains in any active workflow.
Only workflow identity lines and this handoff entry changed. Next action: commit/push this authorship correction.

---

# Independent audit and reconstruction, 2026-10-14

- **Scope:** the economic-intelligence work begins after `b7eb0e4`, spans the ingestion/valuation/archive commits,
  and reaches the new Economy UI in `5699edc` and Markets history in `42d8aa6`. The current task rebuilds those
  affected interfaces and corrects their presentation arithmetic/lifecycle queries. Git position alone was not
  used to attribute the work; the supplied plan, actual functionality and original implementation session were
  inspected. Unrelated ingestion, market data, model outputs and immutable ledgers remain untouched.
- **Token contract:** use the tokens from `b7eb0e4` only, directly. Shared token declarations are unchanged;
  Economy's added `--coins`, `--npc`, `--gross`, `--eco-chart` and history's added colors have been removed.
  No new tokens, token copies, old interface restoration or replacement design system.
- **Reconstruction:** one persistent chart instance, one plot/timeline, optional TC prices on the left axis and
  activity bars on an independent count scale. Gold components and their sum retain the right axis. Labelled
  assumptions, exact HTML chart data, coverage, real gaps, responsive resizing and shared URL state. The initial
  three-instance draft was rejected by the user and replaced; it was never committed or deployed.
- **Additional defects corrected:** day/week comparisons had silently used whole months; no-data periods could
  read as zero or jump to a later date; quarterly top-list truncation lost residual value; incomplete per-creature
  histories could produce spurious growth; the stable-set toggle broke the full-set sum identity; even-sample
  market medians used only the upper middle value; 75% liquidation was absent; asynchronous requests could race
  or continue through navigation; historical queries could hide earlier repository publication or leak later
  evaluations. Forecast controls now retain keyboard focus and use pressed buttons. The adjacent Markets Events
  toggle uses the same button convention, with its existing behavior retained.
- **Validation so far:** 205 JavaScript tests and all 8 site-integrity checks passed; forecast tools 38 passed;
  economy research 13 passed; Research runner 39 run, 2 explicitly skipped (private hosting metadata and the
  producing-machine exact-float variant; the tolerance variant passed). All 6 archived scenario editions reproduced;
  `validate.py` passed with the five-record forecast ledger intact. Chrome Markets, Events, Projections/history
  export and Economy checks; WebKit Economy/history checks. Single-chart Chrome/WebKit rendering was inspected at 1440, 768, 390 and 320 px under light/dark system
  preferences; the existing light palette is retained. Optional comparisons were inspected together at desktop
  and phone widths. Tibia Token, Projections and shared-header regressions passed; transient resize overflow fixed.
- **Production:** currently `release/0005`; reconstruction is local and unreleased. The existing release isolation
  remains in place. Main will receive the reviewed checkpoint, followed by an explicitly validated full release.
- **Known original plan gaps:** population history remains blocked; dated world registry/merger lineage, coverage
  change markers, shared strict eligibility and loot uncertainty are incomplete. The UI now discloses those limits.
  No historical reconstruction, source retrieval or model rerun is claimed by this presentation task.
- **Exact next action:** commit/push the verified rebuild directly to main, create a validated full release and verify
  the deployed asset hashes. Code/data/token diff reviewed; all published datasets and immutable ledgers untouched.

---

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

- **Stage:** all stages A0 to H are done, except where noted under "In progress / remaining". The final five-section
  report was given in the session that made this commit.
- **Production:** `release/0004`, a **full release** of d0204eb (2026-10-14, approved by Claude Code after the full
  Node, Python and Chrome browser suites). The Pages run deployed it, and **all 924 live files equal the release**
  (`node tools/ci/pages_release.mjs verify-live --all`). A browser spot-check of the live Economy page and the Markets
  Forecast history panel worked: the Antica tiles, 96 world rows, the findings, and 6 editions drawn with band and
  marker. `release/policy.json` with `data/economy/**` is now approved, so economy data reach production through
  data releases.
- **Stage G:** no gold-based specification beats the no-change forecast (Stage E), so no gold model enters the
  published Projections. Specification E is archived as a prospective challenger instead (`tc-gold-challenger`, role
  `challenger`): never shown, scored by `evaluate.py`, reproducible from its snapshot.
- **Exact next action:**
  1. Done: the first `economy-daily.yml` run is verified (see "Economy automation verified" at the top). Still
     open: the next run is the first with the gold challenger. Confirm it archives one `tc-gold-challenger` edition
     through `publish.py`, and that a rerun archives nothing.
  2. When target weeks close, check that `forecast-archive.yml` writes `data/forecast-archive/evaluations.jsonl`
     and that the Forecast history accuracy tables fill.
  3. Remaining work below.

- **Caches for this data** (local only; another agent must regenerate them):
  - `node tools/economy/ingest_killstats.mjs --full` (about 2 h);
  - `node tools/economy/fetch_loot.mjs` (about 2 h; 6,605 requests);
  - then `map_creatures.mjs` and `build_gold.mjs` (50 s).

  `build_gold.mjs --check` needs the kill partitions cache. The committed per world-month SHA-256 digests prove a
  rebuild matches.

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
- **C1 code:**
  - `js/economy-killstats.js`: partition codec (gzip of a JSON header plus a varint body), `missingDates`, and
    `recoverDay`, which recovers a day exactly from a later file's weekly counter and refuses otherwise.
  - `tools/economy/ingest_killstats.mjs`.
  - `tests/economy-killstats.test.mjs`: 5 tests.
  - `.cache/` is gitignored.
- **C2 so far:** `js/economy-loot.js` provides:
  - `parseLootPage` and `parseLine`, which read `{{Loot2}}` exactly as `Module:AverageLootValue` does (quirks
    flagged);
  - `parseItemPrices` (highest NPC buy price, buys only);
  - `valueSample` (directCoins and npcPotential, unpriced lines reported);
  - `wikiRound`;
  - `dropRates` (observed binomial Wilson intervals).

  **Parity:** 37 samples on 12 pages (versions 8.6 to 15.32) reproduce the published "Average loot value" exactly.
  The fixture is `tests/fixtures/loot-parity.json` (CC-BY-SA, attributed). `tests/economy-loot.test.mjs`: 6 tests.
  Next is `tools/economy/fetch_loot.mjs` (revision mining).
- **C3 and C4 code (written while the jobs run):**
  - `tools/economy/map_creatures.mjs` maps races to loot pages: override, then the upstream normalisation map, then
    exact, then redirect, then unmatched. A trial with the full page list matched 1,341 of 1,666 races through the
    normalisation map before redirects. Unmatched races are mostly boss mechanics and creatures without loot pages.
    Review by kills after ingestion; overrides go in `data/economy/inputs/creature-map-overrides.json`.
  - `js/economy-value.js` provides `compareVersions`, `versionDater` (exact or bounded), `evidenceAt` (latest or
    point-in-time T), `candidatesByCreature` and `valueOn` (strict, extended, pooled; minimum 100 kills;
    low-sample, backward and pooled flags). `tests/economy-value.test.mjs`: 4 tests, including retroactive
    correction, an upload after the effective date and price vintages.
- **C5 code:** `tools/economy/build_gold.mjs`, injectable through `loadInputs`, with `--as-of T` for point-in-time
  builds into `.cache/economy/gold-pit/` and `--check`.
  - Outputs to `data/economy/gold/`: `index.json`, `worlds/<dir>.json` (daily directCoins, npcPotential, kills,
    killsValued, playerDeaths, grossStable, status o/r/m), `contributions/<dir>.json` (monthly top 30 plus the
    rest) and `creatures.json`.
  - A version log goes to `data/economy/gold-versions.json`.
  - `tests/economy-gold.test.mjs`: 4 hand-checked tests.
  - **Not run on real data yet:** it waits for both long jobs and `map_creatures.mjs`.
- **D so far:** `tools/economy/population/wayback_guildstats.mjs` imports archived GuildStats online-counter
  pages.
  - Labels are Europe/Berlin time, proven by the dip at 10:15, just after the server save. The daily value
    labelled D is the mean of D−1 (within 0.1%).
  - Original intervals are kept (PT15M, PT1H, P1D), and availableAt = capture time.
  - `tests/economy-population.test.mjs`: 4 tests on the archived fixture.
- **Stage C results on real data (2026-10-13):**
  - **Kill stats:** 51 months, 159 world dirs, 1,750 races, 601 days recovered exactly, 0 overlap conflicts,
    87.4 billion kills.
  - **Loot evidence:** 1,454 pages; 132,521 sample versions plus 130,482 "ended" events (15.5 MB compressed;
    frequently hunted creatures such as Bat and Dog have over 1,000 revisions since 2022); 47 ItemPrices vintages;
    817 versions.
  - **Matching:** 1,401 of 1,750 races matched, covering 98.77% of kills:
    - normalized 1,390, redirect 4, singularized 7 (plurals such as reality reavers and rabid wolves);
    - 349 unmatched: summons and mechanics without loot pages, plus shared names such as nomads and butterflies,
      left unvalued rather than borrowing one variant's loot.
  - **Gold build** (latest evidence, strict rule) takes 50 s; outputs are 13 MB. 2,035 live samples; 1,284
    creatures in the stable set.
    - **Antica:** 1,513 kill days (7 recovered, 0 missing); kill coverage 98.1%.
    - **Antica, 2025-09:** 49.4 M kills; directCoins 16.76 bn gp; npcPotential 27.11 bn gp; gross potential
      43.87 bn gp from valued creatures. Top creatures: Grimeleech, Dark Torturer, Frazzlemaw.
    - **Large daily swings** (2.4×, for example 2023-06-02 and 06-05) are kill-volume changes, probably game
      events; check them against the Events data in Stage E.
  - `tests/economy-map.test.mjs`: 3 tests. JS suite: 185 pass.
- **Stage D so far:**
  - `tools/economy/population/wayback_guildstats.mjs` reads every archived label format and verifies each daily
    series' meaning against the same page's hourly data (median relative error under 1%); otherwise it stays
    unverified. Unknown formats are skipped and reported. On the 2025-05-18 page, previous-day average:
    25 of 28 days within 1%.
  - `import_tibiavip_snapshot.mjs` together with `pdf_text.swift`. The snapshot
    `data/economy/population/tibiavip-snapshot/2026-10-13.json` has 96 worlds (online, characters-known-total,
    guilds; observedAt 2026-10-13T19:36:43Z from the saved PDF, SHA-256 recorded).
  - `collect_gated.mjs` makes one plain request each to GuildStats and TibiaVIP. Both are `blocked-challenge`
    (HTTP 403) since 2026-10-14T02:41Z (`data/economy/population/access.json`); nothing is collected and nothing
    is circumvented. It runs daily in `market-daily.yml`.
  - `sample_tibiadata.mjs` and `.github/workflows/online-sampler.yml`: every 30 min, on the `data/online-samples`
    branch (prospective; first local sample 2026-10-14T02:40:47Z: 96 worlds, 13,379 online).
  - Population tests: 6. JS suite: 186 pass.
  - **Wayback import done:** 179 captures (`data/economy/population/guildstats-wayback/`, 18 MB, compact format).
    - **All worlds:** 155 captures, 2014-12-16 to 2025-11-16; 3,867 daily averages (verified meaning: average of
      the previous day); hourly points as average of the hour ending at the label (20,279) or count at the label
      (11,132), each verified per page against its 15-minute samples; 22,775 unverified hourly points; 15-minute
      counts.
    - **Single worlds** (one year each): Assombra, Bastia, Belobra, Honbra, Macabra, Ragna (daily unverified),
      Refugia, Secura (2 captures), Serdebra, Victoris.
    - **Revisions:** 90,423 points where a later capture shows another value. The first captured value is kept and
      every revision is listed. Median change 21%, mostly different definitions across page versions; use
      verified-meaning series only.
    - These are sparse archived windows, **not** the required continuous hourly history (still unresolved).
- **Stage E so far:** `reports/economy/economy_research.py` (pinned venv) writes `reports/economy/results.json`.
  - **Preliminary results** (forecasting pending the point-in-time builds; 112 worlds, 5,887 world-weeks; price
    cutoff 2026-10-06):
    - **Levels, pooled R²:** ask 0.26 and bid 0.33 for C (gross); A (direct coins) 0.28/0.35; B 0.24/0.32;
      D 0.30/0.37 (condition number 11.5, opposite signs: the components overlap).
    - **Within-world R²** 0.04–0.13; **between-world R²** 0.14–0.33.
    - **Unit roots:** non-stationary in 30 of 35 log price series and 33 of 35 gold series, so levels risk
      spurious correlation.
    - **Weekly changes** (world and week effects, two-way clustered): within R² at most 0.03; ask.D jointly
      significant, bid.A at p 0.03.
    - **Late-2025 divergence:** no world had most weeks "gold up, price down" over 2025-08 to 2026-02. Mean
      13-week gold growth was +10–20% while prices rose +2–3%. Check a narrower window before writing findings.
    - **Population cross-section** (TibiaVIP, one instant, 92 worlds): log price vs log gross per online
      character R² 0.23; per known character R² 0.01.
- **Incident (Stage B tests):** the first run of `test_archive.py` wrote into the working copy of the real
  archive, because default arguments bound the paths at import. The 5 stray records (basis `test`) and 4 objects were never committed;
    they were removed and the committed archive was restored. Paths now resolve at call time, and the test class
    asserts that the repository archive is byte-identical afterwards.

- **Stage F, Economy page** (`economy.html`, `css/economy.css`, `js/economy.js`, `js/economy-data.js`):
  - **Data:** `build_gold.mjs` also writes `data/economy/gold/monthly.json` (per world and month: directCoins,
    npcPotential, kills, killsValued, days with data, days), so the cross-world table loads one file.
  - **Page:** the world picker in the header; Day, Week, Month, Quarter and Year periods, defaulting to the latest
    complete period; tiles for gross potential from valued creatures, direct coins, potential NPC conversion, kill
    coverage and players killed, each with coverage and days with data. "Gold per active character" shows as
    unavailable, with the reason.
  - **Assumptions and coverage:** hypothetical liquidation scenarios (0, 25, 50, 100%) appear only as a labelled
    assumption tile and a dashed line. A constant-creature-set toggle is available.
  - **Chart:** gold, the TC Sell Offer (median of daily closes per period) and players killed in three panes with
    separate scales. Unfinished periods are not drawn.
  - **Creature contributions:** change is shown only between two complete periods of the same unit.
  - **Cross-world table:** sortable; comparability is stated (missing days, kill coverage under 95%, later start)
    and can be filtered.
  - **Findings and provenance:** findings come from `reports/economy/results.json`; provenance gives the kill
    statistics commits, loot and price revisions, the methodology, access status and the last sync.
  - **Site:** "Economy" is added to every page's menu (Capture, Markets, Trade, Research EN and PT).
  - **Fixes:**
    - `economy_research.py` writes strict JSON (NaN broke `JSON.parse`).
    - The Economy grid no longer widens past the phone viewport.
    - Contributions no longer compared an unfinished month with a full one.
  - **Tests:**
    - `tests/economy-data.test.mjs`: 7 tests.
    - `tests/economy-browser.mjs` (Chrome): recomputes the Antica figures from the data files and drives every
      control, checking 1440, 768 and 390 px with no sideways scroll.
    - Header, Markets and Trade browser suites updated for the five-section menu, all passing in Chrome.
    - Node suite: 194/194. `validate_site.mjs`: 8/8.

- **Stage E, econometrics** (`reports/economy/economy_research.py`, `results.json`, `README.md`,
  `test_economy_research.py`):
  - **Point-in-time fix:** forecasting took each world's latest week, which in a point-in-time build is the
    unfinished trailing week (NaN), so every origin was dropped. It now takes the latest complete week from the
    latest build made by the origin (`features_at`). Features up to 6 weeks old are allowed (monthly builds), and
    their age is reported (mean 2.9 weeks).
  - **Out of sample:** 112 origins, 2024-07-07 to 2026-10-04. Mean absolute error in log %, no change against the
    best gold specification:
    - 1 week: 2.17 vs 2.18 (A);
    - 4 weeks: 4.17 vs 4.39 (E);
    - 13 weeks: 8.02 vs 9.69 (E).

    At 13 weeks A to D are significantly worse than no change (Diebold-Mariano, p about 0.03). E beats drift at 13
    weeks (p 0.04), and A, C and D beat drift at 1 week. None beats no change.
  - **Narrower divergence** (`divergenceByQuarter`, quarter on quarter):
    - gold up and Sell Offer down in 0 of 23 worlds in 2025 Q3 and 0 of 28 in 2025 Q4;
    - 34 of 46 in 2026 Q1 and 36 of 49 in 2026 Q2;
    - the constant creature set gives 33 and 37.

    So the divergence is a first-half-2026 pattern, not a late-2025 one, and not a coverage effect. 2025 Q1 shows 7
    of 10, which may be seasonal.
  - **Daily swing check:** the 2023-06-02 to 06-04 spike (kills about 40 to 80 million a day on 90 worlds) is an
    XP/Skill event with a Loot Event in `data/events/events.json`. It falls on the event days exactly, which confirms
    the day alignment. Loot Event days (4 since 2022) are understated, because the valuation uses normal-time
    samples.
  - **Tests:** 13 synthetic tests:
    - specifications never put all three components together;
    - a missing day makes the week missing;
    - point-in-time features never use a later build or week;
    - quarterly counts, the Diebold-Mariano sign, and strict JSON.

    They now run in `ci.yml`.
  - **Page:** the Economy findings are computed from the results (verdict per horizon, quarterly counts), and the
    browser test checks the verdict against `results.json`.

- **CI fix (Python job):** red from 480af15 to 1172b35, for two reasons:
  - The checkout was shallow, but the forecast-evidence tests read earlier editions from git history. The job now
    uses `fetch-depth: 0`.
  - The publish test's fixture repositories have no `.gitignore`, so a bytecode cache read as a change. Their
    subprocesses now run with `PYTHONDONTWRITEBYTECODE=1`.

  The site job was green throughout. Releases validate with `validate_site.mjs`, which does not run these Python
  tests, so `release/0003` was unaffected.

- **Stage F, Markets "Forecast history" panel** (`js/market-forecast-history.js`,
  `js/market-forecast-history-layer.js`, helpers in `js/forecast-archive.js`, `markets.html`, `css/markets.css`):
  - **Rail and loading:** a new rail tool opens a dock panel. The archive loads only when the panel first opens; the
    market loads exactly as before without it.
  - **Filters:**
    - an "As of" date: editions public by the end of that day, newest first;
    - weeks ahead (1, 4, 13, 26 or 52): each edition's point for the page's world and side, with its band;
    - evidence: website, else repository (labelled), or website only;
    - model;
    - an optional list of editions archived but never published (labelled, never drawn).
  - **Each edition shows:** its publication date and evidence level, its model, its reproducibility level, and
    whether it was superseded.
  - **Drawing:** up to 3 editions can be drawn over the chart, each in a stable slot (colour, line style, number).
    Each gets its central path, faint stress band and a numbered hairline on its publication day. Paths extend the
    axis past the history like the projection, and the readout, chart description and exported image (one note line
    per edition) name them. "Chart paths" hides them without losing the choice.
  - **Accuracy:** per class (website, repository only, archived-unpublished, backtest) and horizon, from
    `evaluations.jsonl`. That file does not exist yet, so the panel says no target week has closed. It is fetched
    only when `index.json` counts evaluations.
  - **Versions:** module addresses are bumped together to `?v=20261014-history` (markets, chart, export, events, Tibia
    Token, entry, the new modules, and the `markets.css` tag).
  - **Tests:**
    - `tests/forecast-archive.test.mjs`: 3 new tests for listing, horizons and the axis.
    - `tests/market-forecast-history-browser.mjs` (Chrome): expected editions and values are read from the archive.
    - Markets suite updated for the new rail tool.
    - All Markets, Events, Screener, Projections, Tibia Token, canonical events (Chrome), header, Economy and Trade
      suites pass.
    - Node suite: 197/197. `validate_site.mjs`: 8/8.

- **A2, economy automation** (`.github/workflows/economy-daily.yml`, `release/policy.json`):
  - **Schedule:** daily at 03:30 UTC (05:30 Berlin in summer), in the shared `data-writers` concurrency group. It
    runs the incremental kill-statistics ingestion (with `GH_TOKEN` for the upstream commit lists), then
    `fetch_loot` and `map_creatures` on Mondays or on request, then `build_gold`, `validate_site`, one commit of
    `data/economy`, a rebase and push, and a data release (exit 3 "nothing to release" counts as success).
  - **Cache:** the kill partitions, commit lists and wiki revisions are in the Actions cache (`economy-v1-*`), saved
    even when a later step fails.
  - **Recovery:** an evicted cache is rebuilt by the same commands (about 2 hours each, within the 330-minute limit).
    The committed per world-month digests prove a rebuilt partition matches.
  - **Policy:** `data/economy/**` and `reports/economy/results.json` are added to `release/policy.json`, effective
    with the next full release.

- **Stage G, gold challenger** (`tools/forecasts/challenger.py`, `test_challenger.py`; branches in `evaluate.py`
  and `reproduce.py`):
  - **Model:** specification E, the log Sell Offer change over 1, 4 and 13 weeks on the 13-week log growth of gross
    potential and of players killed. It is least squares, pooled, on every origin whose target was observed by the
    cutoff.
  - **Data:** everything used is available at generation, so it is point-in-time by construction. The snapshot keeps
    the features, coefficients, origin prices, dataset and program hashes; reproduction is exact (relative difference
    0.0).
  - **Archiving:** idempotent by output digest. An edition is named `tc-gold-challenger/<price cutoff>/<latest
    feature week>`, and `challenger.py` rebuilds `index.json` after archiving.
  - **Automation:** `economy-daily.yml` archives it after the gold build, then publishes `data/economy` and the
    archive as one `publish.py` unit, then makes a data release.
  - **Rehearsal** in a temporary clone (no push): archived 114 points (38 worlds with a price in the origin week
    2026-10-04), the archive check passed, 7 of 7 editions reproduced, a rerun archived nothing, and `publish.py
    --no-push --with data/economy` built one unit.
  - **Display:** the Markets Forecast history panel lists only the Research scenario product; the challenger is never
    displayed.
  - **Tests:** 4 new tests; the forecast suite passes 38 of 38, and the real archive is byte-identical afterwards.

## In progress / remaining

- **First economy workflow run:** see the exact next action.
- **Not built from the plan:**
  - the world registry `data/economy/sources/worlds.json` (merger lineage, BattlEye, location as dated facts);
  - per-creature coverage-change flags and `gold/stable-sets.json` per window (only one constant set, from the
    first kill day, exists, as `grossStable`);
  - observed binomial and empirical uncertainty of loot values (no intervals are shown);
  - published sensitivity builds: extended and pooled rules, coins-only, ±1 day, alternate samples. The rules exist
    in `js/economy-value.js`; there is no CLI flag yet;
  - a shared eligibility module (`js/economy-eligibility.js` with a Python twin). Eligibility is applied inside
    `build_gold.mjs`, `economy-value.js` and `challenger.py`, and tested there;
  - Economy page update and event markers with before and after comparisons;
  - population and productivity panes beyond the TibiaVIP snapshot tile.
- **Research baselines:** the Research models (C, S, H) were not baselines in the econometrics' out-of-sample
  comparison (no change and drift were). The forecast archive grades them separately.

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

- A0: `tools/ci/`, `tools/release.mjs`, `tests/release.test.mjs`, `release/`, `.github/workflows/`, `docs/releases.md`
- B: `tools/forecasts/`, `data/forecast-archive/`, `js/forecast-archive.js`, `tests/forecast-archive.test.mjs`
- A2: `tools/sync_tibiamarket.mjs`, `tools/sync_market.mjs`, `tests/sync-tibiamarket.test.mjs`
- C: `js/economy-{killstats,loot,value}.js`, `tools/economy/`, `data/economy/sources/`, `data/economy/gold/`
- D: `tools/economy/population/`, `data/economy/population/`, `tests/economy-population.test.mjs`
- E: `reports/economy/` (`economy_research.py`, `results.json`, `README.md`, `test_economy_research.py`)
- F: `economy.html`, `css/economy.css`, `js/economy.js`, `js/economy-data.js`, `tests/economy-data.test.mjs`,
  `tests/economy-browser.mjs`; the menus of `index.html`, `markets.html`, `trade.html`, `reports/tc-cycle/*.html`;
  `js/market-forecast-history.js`, `js/market-forecast-history-layer.js`, `tests/market-forecast-history-browser.mjs`
- `docs/economy-plan.md`, this section

## Long-running jobs

- **Monthly point-in-time gold builds** (local only, input to Stage E forecasting):
  - **Command:** `node --max-old-space-size=8192 tools/economy/build_gold.mjs --as-of <YYYY-MM-01T00:00:00Z>`,
    one per month from 2024-01 to 2026-10, into `.cache/economy/gold-pit/<as-of>/`. A build whose `index.json`
    exists is kept, so the loop resumes.
  - **Status:** complete: all 34 months (2024-01 to 2026-10) are built locally. 2025-03 to 2025-10 were rebuilt
    after a fixed `status.split` error.
  - **Dependency:** needs the kill-partition and loot caches above. Another agent must regenerate all of it.
  - **Validation:** each build passes the same checks as the latest-evidence build.
- **First `economy-daily.yml` run** (GitHub Actions, dispatched after this commit):
  - **Cache:** cold, so every kill-statistics month is rebuilt, about 2 hours.
  - **Outputs:** a bot commit of `data/economy` on main.
  - **If it fails:** read the run log and rerun it; the cache saved by the failed run is reused.

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
