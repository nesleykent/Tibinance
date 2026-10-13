# Tibinance economic intelligence, gold generation and forecast archive

## Context

Tibinance (static GitHub Pages site: plain HTML/CSS/JS, Node builders in `tools/`, Python research in
`reports/tc-cycle/`, no backend, **no GitHub Actions yet**) shows TC markets, Research forecasts and Markets
Projections. The owner wants it to become a reproducible economic-intelligence system. It should:

- estimate gold generation potential per world from creature kills × historically applicable loot evidence, with
  coverage made explicit;
- add population and activity data;
- test econometric links to TC prices without leakage or collinearity errors;
- archive every forecast with its complete inputs before a transactional publication, then record real repository
  and website publication evidence;
- grade published forecasts.

### Audit facts (verified 2026-10-13)

- **Kill stats** (tibiamaps): `data/<world>/<YYYY-MM-DD>.json` = TibiaData killstatistics, collected ~04:00
  Europe/Berlin. Archive repo covers 2022-08-23 to 2025-12-04 (~4 GB packed, ~150 worlds incl. retired). The current
  repo covers 2025-12-06 onward and is updated daily. **2025-12-05 is missing.** Verified: `last_week_killed(D)` = Σ
  `last_day_killed` over files D-6..D (1,396/1,396 races exact), so each file is one distinct day. A single missing
  file can be recovered exactly from the weekly counter (never interpolated). ~1,100–1,300 non-zero races per
  world-day gives **~165M rows**. Upstream `normalize-names.mjs` maps kill-stats names to singular creature names.
  **Neither repo has a license.**
- **TibiaWiki** (MediaWiki API, CC-BY-SA): 1,454 pages in namespace 112 (`Loot Statistics:<Creature>`), each holding
  several `{{Loot2|version=…|kills=…}}` samples. The published "Average loot value" (`Module:AverageLootValue`) =
  Σ(item total × highest NPC buy price in `Module:ItemPrices/data`) / kills. Coins count at face value (1/100/10,000),
  and prices are the **current** snapshot, not historical. The ALV mixes direct coins with potential NPC conversion
  (correction 9). Version dates come from `Updates/<version>` infoboxes; some client builds (e.g. 15.32.87b266) have
  no page and need bounding. World infoboxes give online, offline and mergedinto dates.
- **TibiaVIP and GuildStats**: every scripted or in-app-browser request gets a Cloudflare managed challenge (403).
  The Wayback Machine holds ~140 snapshots of GuildStats `online-counter` (global) and ~20 per-world pages (one
  each). Each page embeds 4 series: 24 h and 7 d at 15-minute steps, 30 d hourly, and **1 year daily**. Archived
  TibiaVIP pages are character lists only. The user supplied a TibiaVIP worlds PDF (2026-10-13). Its **Total** is
  total known characters, not active population (Gladibra 163,790 total vs 24 online).
- **TC prices**: `data/market-history/tibia-coin/` (116 worlds; TibiaMarket daily statistics from 2024-01 or
  2024-12, Antica best offers from 2023-01, captures to 2026-10-05). TibiaMarket API is alive. The fetcher re-downloads
  full histories (`start_days_ago=2000`), and the build merges copies by timestamp, failing when a shared row differs.
- **Forecasts already published**: `reports/tc-cycle/forecast-ledger.jsonl` (hash-chained, 5 frozen editions,
  0 scored, prefix-checked by `validate.py`; **never modify it**). Markets Projections copy `results.json`
  `worldForecast`, and git history holds every committed version (`data/market-projections/tibia-coin.json` in
  5 commits, `results.json` in 9).
- **Pages**: currently "deploy from branch" (main, root), so every push deploys without validation. Stage A0 moves
  deployment to a validation-gated workflow before any frequent checkpoint (corrections 10 and 15).

### User decisions (this session)

- Gold-generation views go on a **new Economy page** (5th section). The **forecast-history explorer is a Markets
  dock panel** drawing past editions over the actual chart.
- GuildStats hourly history and TibiaVIP active population **remain required, unresolved research targets**.
  Investigate every legitimate retrieval route. Never present Wayback windows or new TibiaData sampling as equivalent
  replacements; keep historical and prospective series distinct. Build independent parts without waiting. Document
  unresolved requirements. The architecture must accept complete historical datasets later without redesign. No
  manual per-world collection.
- **Boundary I hold**: no Cloudflare or bot-detection circumvention (stealth or persistent Playwright sessions,
  reused clearance cookies, solvers, triggering third-party captures to fetch on our behalf). Collectors run only
  where the source answers normally or with operator permission (allowlist or API key as a GitHub secret).
- Kill stats: **do not republish the archive**. Commit compact derived indicators plus pinned upstream commits,
  URLs and SHA-256 digests. GitHub Actions reproduces from upstream, using Actions cache as temporary storage. A
  Release archive is optional and not built now.
- TibiaMarket: **daily incremental** sync if the source supports it, reusing the existing fetch and build validation.
  Manual observations (screenshots and other user-provided data) are first-class: never overwritten or downgraded.
  Every record keeps source, observation time and ingestion time. Manual updates trigger archiving and evaluation
  immediately, without waiting for the schedule.
- Standing rules: commit and push finished work to `main`; never use the middle dot (U+00B7); numbers fully grouped; one module address
  per page (`?v=` tags bumped together); work solo, with no agent swarms.

## Terminology (corrections 9, 13 and 14; used in every schema, function, chart, tile, export, model and doc)

| Indicator | Definition | Status |
| --- | --- | --- |
| **Direct coin drops** (`directCoins`) | Σ kills × coins per kill (gold, platinum and crystal at 1, 100 and 10,000 gp) | Modelled direct monetary creation from loot |
| **Potential NPC conversion** (`npcPotential`) | Σ kills × NPC sale value of looted items per kill (highest NPC buy price of the evidence vintage) | Potential, not confirmed issuance: items may be kept, traded, consumed or never sold |
| **Estimated gross gold generation potential** (`grossPotential`) | `directCoins + npcPotential` | Maximum modelled gross potential under the stated valuation, not observed monetary expansion |

- Every value covers **valued creatures only** (correction 13). Where kill coverage is incomplete, labels read
  "… from valued creatures" and show kill coverage beside the number. A sum over valued creatures is never
  presented as a world's complete total, and is never scaled to 100%.
- **No liquidation rate is assumed.** A schema slot `liquidationRate` exists for future evidence. Hypothetical
  scenarios (`directCoins + r × npcPotential`, r ∈ {0, 0.25, 0.5, 0.75, 1}) are labelled assumptions everywhere.
- The identity `grossPotential = directCoins + npcPotential` means the three are never unrestricted regressors
  together (correction 14).
- None of these is net monetary expansion, money supply, inflation, GDP or a TC price determinant. The term
  "GoldGenerated" is not used.
- **Temporal terms** (correction 11): `effectiveAt` = when an event, version or observation applies; `availableAt` =
  when its information became accessible. They are never interchangeable. Unknown availability is flagged
  `availability: uncertain`, never assumed.
- **Publication terms** (corrections 7 and 10): generation (`createdAt`) → durable local archival (`archivedAt`) →
  repository publication (on origin/main) → verified website publication (Pages deployment or live hash).

## Architecture (extends existing patterns)

```
data/economy/                      (derived and evidence files, committed, compact)
  README.md                        semantics, terminology, licenses (CC-BY-SA attribution for loot-derived data)
  sources/killstats.json           upstream repos, pinned commit per date, per world-month partition SHA-256,
                                   coverage, missing and recovered dates; per date effectiveAt (kill day) and
                                   availableAt (upstream commit time)
  sources/loot/                    APPEND-ONLY evidence (correction 8): immutable chunk files + manifest.
                                   One record per distinct sample content per revision: {pageId, title, revId,
                                   revTimestamp, sampleKey (pageId + version + ordinal), version, effectiveAt,
                                   effectiveBasis, availableAt (first revision with this exact content),
                                   availability (exact | upper-bound | uncertain), replacedAt (revision that changed
                                   or removed it), contentSha256, kills, items [{name, times, amountMin, amountMax,
                                   total}], provenance}
  sources/item-prices/             APPEND-ONLY price vintages: {revId, revTimestamp (= availableAt),
                                   contentSha256, changes since previous vintage}; any vintage reconstructable as of
                                   any timestamp
  sources/versions.json            client version → effectiveAt (Updates pages) and availableAt (page revision),
                                   bounds for undated builds
  sources/worlds.json              world registry: online, offline, mergedInto, formedFrom, type, location, BattlEye
                                   (TibiaWiki + TibiaData, cross-checked with data/events/events.json); each fact with
                                   effectiveAt and availableAt (announcement or source revision) or uncertain
  inputs/creature-map-overrides.json   reviewed manual mappings (the only hand-edited input)
  loot/expected-value.json         latest-evidence per creature periods {from, to, directCoins, npcPotential,
                                   sampleRef (revId, sampleKey), drop-rate uncertainty, flags}
  gold/versions.json               every derived version: methodologyVersion, mode, evidence vintage (loot revIds,
                                   price revId), kill commits, code commit, so earlier published results stay
                                   reproducible
  gold/index.json                  per world summary: kill coverage, valued totals, quality flags, breaks (merges),
                                   missing or uncertain loot evidence, methodology version, evidence vintage
  gold/worlds/<world>.json         daily arrays from `first` (correction 13): kills (all observed), killsValued,
                                   killsUnvalued, directCoins, npcPotential (valued creatures only), playerDeaths,
                                   status (observed|recovered|missing), coverage-change flags (newly valued creature,
                                   evidence revision)
  gold/stable-sets.json            constant-coverage creature sets per world and window, for comparisons free of
                                   coverage or evidence changes
  gold/contributions/<world>.json  monthly top 30 creatures + residual (kills, directCoins, npcPotential)
  population/<source>/…            source-agnostic observations {world, observedAt (effectiveAt), interval, metric,
                                   value, source, collectedAt, availableAt, availability, definition}; sources:
                                   guildstats-wayback, tibiavip-snapshot, tibiadata-online (prospective),
                                   guildstats, tibiavip (permission-gated)
  population/index.json            coverage per source and world; access log (ok | blocked-challenge | error)
  sync-status.json                 last attempt and success per source; stale vs missing
data/forecast-archive/
  publications.jsonl               append-only SHA-256 hash chain (ledger.py pattern). Each record has a stable
                                   `contentHash` (body without seq, prev and hash) used for every cross-reference, so a
                                   rebased chain keeps record identity. Record types:
                                   forecast (immutable content: createdAt, archivedAt, outputs, model, config,
                                   cutoff, target, horizon, input-snapshot hash, evidence vintage, code commit,
                                   seed and runtime, reproducibility level)
                                   publication-evidence (level repository | website, evidence source, timestamp,
                                   basis, uncertainty)
                                   publication-failure, presentation, supersession
  inputs/<contentHash>.json.gz     immutable forecast-input snapshots (correction 12): exact feature values,
                                   preprocessing config, dataset ids and hashes, evidence vintages, missing-input list
  evaluations.jsonl                append-only chain: evaluation | evaluation-superseded
  backtests/                       simulations, always labelled, never mixed with forecasts
  index.json                       derived UI view (lifecycle state, evidence level), rebuilt from the JSONL files
reports/economy/                   Python econometrics (pinned numpy, pandas, scipy, statsmodels from tc-cycle)
tools/economy/*.mjs                ingest_killstats, fetch_loot (with revision mining), fetch_worlds, build_gold
                                   (--mode latest-evidence | point-in-time --as-of), population adapters
js/economy-eligibility.js (+ python twin in reports/economy)  temporal eligibility policy (correction 11)
tools/forecasts/*.py               archive.py, publish.py (transaction), publish_evidence.py, reproduce.py,
                                   evaluate.py (ledger.py chain helpers, research_data rules)
js/economy-*.js                    pure logic shared by tools, tests and the page; js/economy.js page UI
js/forecast-archive.js             pure lifecycle, as-of filtering by evidence level, metrics; Markets panel + layer
economy.html, css/economy.css
.github/workflows/                 ci, pages (deploys only approved release revisions), economy-daily,
                                   market-daily, forecast-archive, online-sampler
release/                           production.json (approved release), releases.jsonl (append-only chain),
                                   policy.json (data-release path allowlist); tags release/NNNN
tools/release.mjs                  the single release operation (--full <commit> | --data <commit>)
tools/ci/validate_site.mjs         required integrity checks on any tree (main HEAD or a release candidate)
.cache/ (ignored)                  normalized kill partitions (local and Actions cache only)
```

## Corrections applied after review (binding)

1. **Effective date vs availability date.** Every loot sample carries `effectiveAt` (its version date) and
   `availableAt` (timestamp of the first wiki revision containing it, mined from revision history). Every ItemPrices
   vintage carries the revision timestamp it came from. Two modes are defined fully in correction 8, with
   eligibility in correction 11. Revision mining is required for Stage E/G, not optional.
2. **No assumed drop model.** No CI built from independent-drop or uniform-amount assumptions. Uncertainty is:
   - observed binomial uncertainty of each item's drop frequency (times out of kills), reported as such;
   - empirical sampling dispersion of creatures with several samples in the same regime (spread vs kills, fitted
     only from real repeated samples, labelled empirical);
   - transparent sensitivity runs: strict, extended, pooled, coins-only, alternate samples, low-sample exclusion,
     ±1-day alignment, hypothetical liquidation rates, constant-coverage sets.

   Where none is supported, no interval is shown.
3. **Coverage, three separate quantities.** (a) Observed kill coverage = valued kills / all kills (known).
   (b) Valued totals = directCoins and npcPotential from valued creatures, known components and never a share of an
   unknown total. (c) Model-based coverage estimates, labelled models with stated assumptions, reported separately
   and never presented as known monetary coverage. Extended by correction 13.
4. **Archiving is an atomic prerequisite of publication.**
   - `tools/forecasts/archive.py` (stdlib only, single writer of `publications.jsonl`) runs `--ensure` before any
     published representation changes. `build_market_projections.mjs` calls it and writes projections only after
     the append is durably on disk (fsync); on failure, nothing is written.
   - The Research chain adds `archive.py --ensure` right after `ledger.py` in its README order. `archive.py --check`
     fails when the working-tree `results.json` or projections edition is not archived.
   - The check runs in the standard pre-commit test run, in a versioned hook (`tools/hooks/pre-commit`, enabled
     with `git config core.hooksPath tools/hooks`), and in `ci.yml`. Hooks are a convenience only; correction 10
     makes the server-side checks the guarantee.
   - Git-history backfill covers editions committed before the archive existed.
5. **Benchmark before committing to the full pipeline (Stage C0 gate).** Measure on a real sample (one week, all
   worlds, both repos):
   - parse throughput, normalized partition size per candidate format, extrapolated full-history size and time;
   - codeload tarball viability and partial-clone tree cost;
   - wiki revision counts and download volume for loot pages and ItemPrices since 2022-08;
   - Actions limits: 6 h per job, runner disk, 10 GB cache per repo, 7-day eviction, Release limits (for the record).

   The chosen strategy and numbers go in PROGRESS.md before the full run.
6. **Manual ingestion paths preserved and unified.**
   - The browser Capture/IndexedDB/export path and the screenshot update procedure stay exactly as they are
     (reprocess, finalize, validate_rebuild, market_update, build_market_history…).
   - A new validated `manual` input channel is added. A single entry point, `tools/sync_market.mjs`, runs:
     input validation, build_market_history, audits, the publication transaction (`publish.py`, correction 10),
     publish_evidence, evaluate.py, checks, then a data release (`release.mjs --data`, Stage A0). The daily
     workflow, the manual procedure (documented step) and the on-push workflow for manual pushes all call it, so
     every source gets the same validation, reconciliation, evaluation and release path, and manual updates still
     go live immediately.
7. **Created vs archived vs published.**
   - Three timestamps are kept apart: `createdAt` (generation), `archivedAt` (durable append) and `publishedAt`
     (public availability, with evidence).
   - Lifecycle states: `created`, `archived`, `published` (evidence level `repository` or `website-verified`),
     `publication-failed`, `superseded`. An append proves archival, never publication.
   - Evidence is appended as separate records:
     - `repository`: the edition's content is present in a commit on origin/main; timestamp = committer date,
       basis `git-committer-date`, uncertainty "push and deploy time unknown".
     - `website-verified`: a successful GitHub Pages deployment of a release (Stage A0) whose tree contains it
       (Deployments API status timestamp, release tag), or a live fetch whose SHA-256 matches (observedAt).
     - `publication-failure`: the release containing it failed validation or deployment, or the edition never
       reached main or a release within the stated window.
   - Backfill records the basis and uncertainty of every timestamp and never invents one.
   - As-of queries default to website-verified evidence, fall back to repository evidence with a visible label, and
     never show archived-only forecasts as public predictions.
   - Accuracy reporting separates authentic published forecasts (by evidence level), archived-unpublished forecasts
     and backtests.
8. **Loot revisions and point-in-time reconstruction.**
   - The append-only `sources/loot/` and `sources/item-prices/` keep every relevant revision's identity and content
     (fields in Architecture). A retroactive edit to a sample under the same version string creates a new evidence
     record; nothing is overwritten.
   - Two modes:
     - **Latest-evidence reconstruction**: newest validated evidence, applied by effective dates. This is the default
       for the Economy page, labelled with its evidence vintage.
     - **Point-in-time reconstruction** (`--as-of T`): applies the full eligibility policy of correction 11.
   - Forecast backtests and the Stage G challenger use point-in-time exclusively. A published forecast stores its
     feature values plus evidence vintage (correction 12), so later corrections never alter its recorded inputs.
   - Derived economic datasets may be updated when evidence improves, but every version is listed in
     `gold/versions.json` (methodology version, evidence revIds, code commit), and the evidence needed to reproduce
     earlier results is never deleted.
9. **Direct coins vs potential NPC conversion vs gross potential**: see Terminology; applied in every stage below.
10. **Transactional forecast publication** (`tools/forecasts/publish.py`, used by manual and automated flows):
    1. Generate the forecast, then archive its immutable record and input snapshot (`archive.py --ensure`, fsync).
    2. Stage one **publication unit**: archive files, input snapshot, `index.json` and the published representation
       (`results.json` edition and/or projections). A unit manifest lists every file's SHA-256 and the forecast
       `contentHash` each representation refers to.
    3. Validate before committing: hash chain, snapshot hash, representation ↔ archive cross-references, fresh
       index, and the ledger untouched.
    4. One git commit for the unit.
    5. `git fetch` then rebase on origin/main. If both sides appended to `publications.jsonl`, run
       `archive.py --reconcile`: keep origin's chain, re-append local-only records by `contentHash` (content
       unchanged, new seq and prev), never drop or overwrite a record, then revalidate.
    6. Push only after validation passes.
    7. A failed push leaves the local commit and archive intact; retry is idempotent (content hashes dedupe).
    8. Website publication is a separate step: a data release (`tools/release.mjs --data`, Stage A0) carrying the
       unit, validated as an exact artifact, then deployed.
    - **Server-side guarantees, not hooks**:
      - `ci.yml` rejects any commit where a published representation lacks its archive record or snapshot.
      - `pages.yml` deploys only approved release revisions whose exact artifact passed the same validation. Pages
        moves from "deploy from branch" to "GitHub Actions" in Stage A0 (a repository setting change, made because
        it is explicitly required here).
      - Bot workflows start `pages.yml` with `workflow_dispatch`, since GITHUB_TOKEN pushes trigger no workflows.
    - **No cross-system atomicity claim**: deployment is a separate, verifiable event. A failed deployment appends
      `publication-failure` and keeps repository evidence; the forecast record is never modified. Archived editions
      that never reach origin/main stay `archived-unpublished`.
    - **Concurrency**: one Actions concurrency group for every writer, a lock file in the unit protocol for local
      runs, fetch and rebase before commit and before push. Never force-push; never overwrite another publication.
11. **Strict historical information availability** (`js/economy-eligibility.js` and its Python twin, one policy
    shared by builders, backtests and tests). For cutoff T, an input is eligible only if:
    1. its observation period ended ≤ T;
    2. its source data was available ≤ T;
    3. its Tibia version or regime was effective by the observation date;
    4. its loot evidence revision is ≤ T;
    5. its NPC price vintage is ≤ T;
    6. its world metadata, merger facts and event indicators were known by T;
    7. every transformation and feature uses only eligible observations;
    8. normalization, imputation, feature selection and fitting use the training period only;
    9. rolling statistics use only data available at their calculation time;
    10. corrections published after T are excluded even when they refer to earlier periods.

    Uncertain availability is excluded from strict backtests and kept, flagged, in descriptive reconstruction.
    Automated leakage tests cover every source and feature family.
12. **Complete forecast input preservation.** Every authentic forecast keeps:
    - exact outputs;
    - model id, version, configuration and parameters;
    - cutoff, target definition and horizon;
    - exact feature values (the minimal sufficient series, e.g. the training weekly medians and world anchors, not
      whole datasets);
    - dataset ids and hashes, evidence vintages, preprocessing configuration;
    - code commit, plus seed and runtime metadata for stochastic parts;
    - publication evidence.

    Two reproducibility levels are recorded per forecast:
    - **Prediction reproducibility**: `reproduce.py` rebuilds the outputs from the snapshot.
    - **Full research reproducibility**: rebuilding the inputs from sources, with stated dependence on external
      sources.

    Backfills keep every recoverable input (from git history of this repository) and list what is missing; nothing
    is fabricated. Records and snapshots are immutable; later corrections only add evaluations or new editions.
13. **Incomplete coverage and comparability.**
    - Per world and period, keep:
      - all observed kills, valued kills, unvalued kills and kill coverage;
      - the three components from valued creatures;
      - missing or uncertain loot evidence;
      - methodology version, evidence vintage and quality flags.
    - Cross-world views show raw estimates and coverage-aware comparisons (kill coverage, world age, merges,
      observation period, missing days, methodology version).
    - Change analysis separates activity from coverage and evidence effects through constant-coverage stable
      creature sets and flags for newly valued creatures or revised evidence. False growth from coverage is
      prevented.
    - No silent scaling to 100%. Any extrapolation is model-based, separate, with stated assumptions and
      sensitivity, and out of primary results unless validated.
    - Missing values are never zero. Excluded worlds and periods are always reported with the resulting sample.
14. **Identification and collinearity.** Separate specifications:
    - **A**: TC ~ directCoins.
    - **B**: TC ~ npcPotential.
    - **C**: TC ~ grossPotential.
    - **D**: TC ~ directCoins + npcPotential, with rank, condition number and VIF diagnostics.
    - **E**: extensions with population, productivity, world characteristics, time effects and validated controls.

    The three components are never unrestricted regressors together. R² is reported per specification. Comparisons
    use common samples and identical forecast origins, or are explicitly qualified. Association, within-world
    variation, between-world variation, predictive performance and causal identification are kept apart.
    Coefficients are not causal. Incremental predictive contribution is measured against the existing baselines.
    The ~45% figure is a reference, not a target, and model selection never optimizes toward it.
15. **Production isolated from checkpoints**: deployment safety (Stage A0) is the first prerequisite.
    - Continuous pushes to main are kept.
    - Pages deploys only approved, immutable release revisions (tags plus the manifest), validated as exact
      artifacts.
    - Code reaches production only through an explicit full release; validated data through data releases. See
      Stage A0 and the handoff section.

## Execution stages (dependency order; checkpoints pushed continuously, see the handoff section)

### Stage A0: deployment safety bootstrap (first prerequisite; part of A2, executed before everything else)

Pages currently deploys every push to main from the branch, so frequent checkpoints would ship unfinished work,
including incomplete edits to existing public files. A0 isolates production: **Pages deploys only an explicitly
approved, immutable release revision**, never the latest main. Checkpoints keep flowing to main continuously.
Frequent checkpoints begin only after A0 is active.

**Release model**

- **Release revision** = an immutable git commit referenced by an annotated tag `release/NNNN` (never moved or
  deleted). The Pages artifact is built from that commit's complete tree: HTML, CSS, JS and data, minus only
  `.git`, `.github` and `.cache`.
- **Release manifest on main**:
  - `release/production.json`: current tag, commit, tree, kind, code and data source commits, artifact digest,
    validation run, approver (agent or user), createdAt;
  - `release/releases.jsonl`: append-only, hash-chained log of every release.
- **Release kinds**, both produced only by `tools/release.mjs` (the single release operation, usable by Claude
  Code, Codex, the user and bot workflows):
  - **Full release** (`--full <commit>`): an explicit decision by an agent or the user after verification. The
    release revision is that main commit exactly. It is the only way code, pages or styles reach production.
  - **Data release** (`--data <commit>`): for validated data updates (TibiaMarket sync, screenshot or manual updates,
    economy data, forecast publications and evidence). Plumbing builds a release commit whose tree = the current
    production tree with only the paths allowlisted in `release/policy.json` replaced from `<commit>`. Allowlisted
    examples: `data/market-history/**`, `data/observations*`, Research outputs and projections when they arrive
    through the publication transaction, `data/forecast-archive/**`, released `data/economy/**`. Its parent is the
    previous release commit, so no checkpoint code can ride along. Changing the policy itself needs a full release.
- **Validation of the exact artifact**: `release.mjs` checks out the candidate tree in a temporary worktree and
  runs that tree's own `tools/ci/validate_site.mjs`:
  - its unit tests;
  - builder `--check`s;
  - forecast-archive and representation integrity;
  - data-format compatibility with the tree's code;
  - copy rules;
  - required-file presence for every page's script, style and data references.

  It then builds the artifact directory, computes its digest, and only then tags, records the manifest and pushes
  (tag plus manifest commit, after fetch and rebase). `pages.yml` repeats the validation on the same tag and
  deploys only if its digest equals the manifest's. A failure at any step deploys nothing and leaves the live site
  unchanged.
- `pages.yml` (workflow on main): trigger is `workflow_dispatch` with the tag (release.mjs and bot workflows
  dispatch it; GITHUB_TOKEN pushes trigger no workflows), plus push to `release/production.json` as a backstop.
  Jobs: read manifest, check out the tag, validate, build, compare digest, deploy (`actions/deploy-pages`). While
  Pages `build_type` is still `legacy` it runs in **dry-run** (no deploy).
- `ci.yml`: `validate_site.mjs` on main HEAD plus the Python suites (pinned requirements) on every push and PR, so
  checkpoints stay tested without being released.
- **Bot workflows** (A2) end with a data release after their validated update. `tools/sync_market.mjs` (manual
  path) does the same, so manual updates still go live immediately, as they do today, without shipping any
  unreleased code.
- **Concurrency**: one Actions concurrency group plus a local lock for releases. Tags are never reused or moved, and
  the manifest log rebases by content. Never force-push.
- New features in existing files still use isolated modules and default-off flags, but production safety no longer
  depends on them: unreleased edits simply are not in the release revision.

**Bootstrap sequence (Pages still deploy-from-branch; preserves the existing site)**

1. **Prerequisite check**: the gh token needs `workflow` scope to push `.github/workflows/*` (if missing, the user
   runs `gh auth refresh -s workflow`). The account must be repository admin to change Pages settings.
2. **Release 0001 = the commit the live site serves today** (origin/main before any change, currently
   `b7eb0e4`). Tag `release/0001` on it.
3. **Commit 1 (site-neutral)**: workflows, `tools/release.mjs`, `validate_site.mjs`, `release/policy.json`,
   `release/production.json` (pointing at release 0001), `releases.jsonl`, `docs/economy-plan.md` and PROGRESS.md.
   It changes no page, script, style or data the site uses; branch deploy republishes the same site plus inert new
   files.
4. **Dry-run validation**: `gh workflow run pages.yml` for `release/0001`. Confirm validate and build pass and
   deploy is skipped. Download the artifact (`gh run download`) and compare its file list and SHA-256s with the
   tree of `b7eb0e4` and with live fetches of key files: every page, script, style, data file and report present
   and byte-identical. `ci.yml` passes on main.
5. **Activate**: `gh api -X PUT repos/nesleykent/Tibinance/pages -f build_type=workflow` (the current deployment
   keeps serving meanwhile), then dispatch `pages.yml` for `release/0001`.
6. **Verify production**: deployment succeeds; live SHA-256 of `index.html`, `markets.html`, `trade.html`,
   `reports/tc-cycle/index.html`, `data/market-history/tibia-coin/index.json` and
   `data/market-projections/tibia-coin.json` match release 0001; browser spot-check of each page.
7. **Rollback path**: if deploy or verification fails, switch back to the branch source (`build_type=legacy`,
   main /). The last good deployment stays live throughout. Record the outcome in PROGRESS.md.
8. **Isolation test**:
   - push a checkpoint that edits an existing public file (a harmless comment) and adds a new path;
   - confirm nothing deploys and the live file is unchanged;
   - then run a data release with no data changes and confirm it is refused as empty, or yields an identical
     artifact digest.

Only after step 8 do frequent implementation checkpoints start. Pages settings change only in step 5 (or 7).

### Stage B: forecast archive (independent; first)

1. `tools/forecasts/archive.py`: canonical JSON and hash chain reused from `reports/tc-cycle/ledger.py`
   (`canonical`, `append`, `read` pattern), plus a stable `contentHash` per record.
   - A `forecast` record holds:
     - id, product, model id/version/config/parameters, dataCutoff;
     - `createdAt` (Research `recordedAt` or asOf) and `archivedAt` (append time);
     - exact outputs, target definition (Research scoring: weekly median of daily median offers in the Mon–Sun week
       holding the target date), horizon, interval and interval kind (`heuristic-stress-band` vs
       `simulated-p10-p90`);
     - conditions and confidence;
     - input-snapshot hash, evidence vintage, code commit, seed and runtime metadata, reproducibility level;
     - provenance `authentic` | `backtest`.
   - Writes the immutable input snapshot `inputs/<contentHash>.json.gz` (correction 12).
   - Idempotent by content hash. A changed edition for the same cutoff becomes a new forecast plus a `supersession`
     link. `--reconcile` handles concurrent chains (correction 10).
2. `tools/forecasts/publish.py`: the transaction protocol of correction 10 (stage unit, validate, commit, fetch and
   rebase, reconcile, revalidate, push, idempotent retry, lock).
3. `tools/forecasts/publish_evidence.py` (correction 7): appends `publication-evidence` and `publication-failure`
   records from git (origin/main), the GitHub Deployments API (github-pages environment statuses) and optional
   live-fetch hashes. Idempotent.
4. Backfill (authentic only): walk origin/main history of `results.json` (`worldForecast`) and
   `data/market-projections/tibia-coin.json`.
   - Each distinct version becomes one `forecast` (createdAt = its asOf or Research recordedAt; archivedAt = backfill
     time, labelled `archivedAt-basis: backfill`).
   - Its input snapshot is recovered from the same commit (weekly series, anchors, config, program hashes), with
     missing inputs listed.
   - Repository evidence comes from the first main commit containing it. Website evidence comes only from deployment
     records that actually exist.
   - Projections become `presentation` records of the Research edition they copy.
   - Import the 5 ledger forecasts read-only (Antica C, S, H, C+S, C+S+H; fan quantiles with seed 11; world 13/26-week
     transfers), referencing ledger seq and hash.
5. `tools/forecasts/reproduce.py`: prediction reproducibility from snapshots, reusing `analyze.py` functions;
   verified on the current edition and on each backfilled edition whose inputs are complete.
6. `tools/forecasts/evaluate.py`: for closed target weeks, compute the actual with the **same** rules as
   `research_data.build_daily` / `weekly_series` (imported, not reimplemented), fed with the current
   Markets-merged inputs (TibiaMarket copies + captures + manual), and record dataset hashes.
   - Appends absolute and percentage error (zero denominators guarded) and band or interval hit.
   - A changed later actual appends `evaluation-superseded`.
   - Missing weeks stay `observation unavailable`.
   - Every evaluation carries the forecast's evidence level.
7. `index.json` builder plus `js/forecast-archive.js`:
   - lifecycle states (correction 7);
   - as-of filtering by publication evidence (never later revisions, never archived-only);
   - aggregates by horizon, world, model version and over time, plus bias and coverage, split by authentic
     published, archived-unpublished and backtest.
8. Atomic hook and CI (corrections 4 and 10): `build_market_projections.mjs` calls `archive.py --ensure` and writes
   only after a durable append. The Research README order gains `archive.py --ensure` after `ledger.py` and
   `publish.py` for the commit. `--check` runs in the test run, in the versioned pre-commit hook, in `ci.yml`, and
   in `release.mjs` and `pages.yml` on the exact release artifact. Historical websites before Stage A0 have no
   release records, so backfilled editions get website evidence only from GitHub's recorded Pages deployments
   where those exist.

### Stage C: historical gold generation potential

0. Benchmark gate (correction 5) before the full historical run, including wiki revision volumes.
1. `tools/economy/ingest_killstats.mjs`: pin upstream HEAD SHAs, then stream either the codeload tarball or a
   blobless partial clone with sparse checkout per month (pick by benchmark).
   - Write normalized monthly partitions to `.cache/economy/killstats/` in a format chosen by measured size and
     decode speed (gzip NDJSON vs columnar gzip vs zstd).
   - Record per-file SHA-256 in the cache and per world-month digests in `sources/killstats.json`.
   - Detect gaps and conflicts (overlapping repos must agree), and recover single missing days from `last_week`.
   - Incremental mode fetches only dates after the last processed one.
   - Per date: `effectiveAt` (kill day) and `availableAt` (upstream commit time). Upstream rewrites of old files
     (name normalization) are detected by digest and recorded as corrections with their own availableAt.
2. `tools/economy/fetch_loot.mjs`: MediaWiki API with a descriptive UA, ~1 req/s and `maxlag`.
   - Fetches ns 112 page contents in batches of 50, `Module:ItemPrices/data`, `Updates/*` dates and world
     infoboxes.
   - **Revision mining** (correction 8): for every loot page and for ItemPrices, the revision current at 2022-08-23
     plus every later revision. `availableAt` of older samples is resolved by binary search or stated as an upper
     bound (`availability: upper-bound`).
   - Appends evidence records to `sources/loot/` and `sources/item-prices/`. Incremental by `lastrevid`.
   - Version and world facts get `effectiveAt` and `availableAt` (correction 11).
   - Parser for `Loot2` (Empty, times, amount, total quirks exactly as the Lua module). Coins and items are separated
     at parse time (correction 9).
3. Name mapping: kill-stats name → upstream pretty name → wiki page (case-insensitive, redirects) → reviewed
   overrides. Stable id = wiki page id. Unmatched races are reported ranked by kills.
4. Expected-value rule (deterministic, documented, per mode). Applicable sample at date t = latest sample whose
   `effectiveAt` ≤ t (ties: more kills). Prefer the latest such sample with ≥ 100 kills, else the latest, flagged
   low-sample. In point-in-time mode, the candidate set is restricted by the eligibility policy (correction 11).
   Undated builds are bounded by the latest dated version below them (flag `version-date-bounded`).
   - **Strict** (primary): kills before a creature's first sample are unvalued, reducing kill coverage.
   - **Extended** (labelled sensitivity): backward application.
   - **Pooled** (labelled sensitivity): kill-weighted average of samples ≤ t.
   - **Coins-only** (= directCoins alone).

   Per creature it yields `directCoins` per kill (coins at face) and `npcPotential` per kill (items at the vintage's
   highest NPC buy price). Their sum is parity-tested against rendered "Average loot value" fixtures (same
   definition). Uncertainty follows correction 2.
5. `tools/economy/build_gold.mjs --mode latest-evidence | point-in-time --as-of T`:
   directCoins = Σ kills × coins/kill; npcPotential = Σ kills × NPC value/kill; grossPotential = their sum
   (computed, not stored twice), all over valued creatures (correction 13). Kill day = file date − 1 (documented;
   ±1-day sensitivity).
   - Outputs all per-period fields of correction 13, kill coverage, valued totals and labelled model-based
     estimates separately (correction 3), plus playerDeaths (activity proxy, labelled).
   - Also outputs coverage-change flags, constant-coverage stable sets (`gold/stable-sets.json`), merge breaks,
     monthly contributions per component, and global totals only where coverage is complete.
   - Writes the version entry to `gold/versions.json`. Partition hashes skip unchanged work; an evidence change
     triggers revaluation from cache as a new derived version.
6. World registry and lineage (`sources/worlds.json`): series are never chained across merges; predecessors are
   shown as lineage; transfers are a documented limitation.

### Stage D: population and activity (independent parts now; gated sources documented as unresolved)

1. Source-agnostic observation schema and importers designed so complete GuildStats or TibiaVIP histories can be
   loaded later without redesign. Each observation carries `effectiveAt` (observedAt), `collectedAt`, `availableAt`
   and availability quality (correction 11).
2. Wayback importer (legitimate archival copies): CDX listing, then fetch `id_` snapshots, then parse all 4 embedded
   series with original labels resolved to timestamps (timezone verified via the 10:00 Berlin server-save dip).
   - The meaning of the daily value (mean or peak) is checked against the hourly series in the same snapshot.
   - Stored as `guildstats-wayback`, labelled sparse archived windows, never a substitute for the required hourly
     history. `availableAt` = capture timestamp (provable) for strict backtests.
3. TibiaVIP PDF snapshot importer: `total known characters`, online and guilds, dated 2026-10-13 (`availableAt` =
   that date), with the source file's SHA-256. The PDF itself is not committed. Active-population reconstruction
   stays an open requirement.
4. Permission-gated collectors for GuildStats online-counter and TibiaVIP worlds. They log `blocked-challenge` and
   never evade. Credentials come only from repo secrets. I draft the access-request text for the user.
5. Prospective `tibiadata-online` sampler: `/v4/worlds` every 30 min, one request for all worlds, committed to a
   side branch and folded into main daily. Optional distinct-online-characters (trailing 30/90 d) via keyed
   HyperLogLog sketches, no names stored. Always labelled prospective, never merged into historical series.
6. Bounded investigation of other legitimate datasets (documented endpoints, public repos, browser-accessible
   exports), with the result logged in docs.
7. Indicators: player-hours = Σ value × actual interval, integrated only across contiguous samples (max-gap rule,
   coverage reported). Per-character and per-online-hour figures are computed for **each** component (directCoins,
   npcPotential, grossPotential, from valued creatures) only when windows align; otherwise "unavailable" with the
   reason. Zero denominators are guarded.

### Stage E: econometrics (`reports/economy/`)

Weekly and monthly world panel: TC (Research weekly median offers; daily averagePrice as an alternative),
**directCoins, npcPotential and grossPotential** from valued creatures, kill coverage, growth, player deaths,
population where present, world age, type, location and merges.

- **Data rules**:
  - Panels for any forecasting exercise are point-in-time and apply the eligibility policy (correction 11).
    Descriptive analyses may use latest-evidence data, labelled.
  - Missing values are never zero.
  - Coverage handling is documented per specification: kill coverage as a control, constant-coverage stable-set
    robustness, and exclusion thresholds with the resulting sample reported (correction 13).
- **Specifications A–E** (correction 14), each with its own R², on common samples or explicitly qualified. Model D
  reports rank, condition number and VIF.
- **Reconstruction**: R² of price level on each specification (pooled, between worlds, within Antica), shown beside
  unit-root tests and differenced specifications. It is not forced toward 45%, and combining components is not
  assumed to help.
- **Within-world**: Δlog price on Δlog component lags (1, 2, 4, 8, 13 weeks; selection on training data only), with
  two-way fixed effects and two-way clustered SEs.
- **Between-world**: cross-sections with time effects.
- **Late-2025 divergence**: detection per world and component (start, duration, seasonality via YoY, activity,
  events), with coverage effects separated.
- **Out-of-sample**: expanding weekly origins, horizons 1, 4 and 13 weeks, identical origins for every model.
  Baselines are the existing models (imported from `analyze.py`). Variants A–E add each component to the baseline;
  incremental predictive contribution and Diebold–Mariano are reported against the baseline. Other metrics: MAE,
  RMSE, MAPE, sMAPE and bias. Normalization, imputation, lag and feature selection are fitted on training windows
  only.
- Liquidation-rate scenarios appear only as labelled sensitivity.
- Outputs `results.json` plus README findings. Association, within, between, predictive and causal claims are kept
  apart, with no causal claims made.

### Stage F: interface

- `economy.html` + `js/economy.js` (Lightweight Charts 5.2.1 as Markets, same tokens and site header with an
  "Economy" link added to every page's menu). It has:
  - world picker (searchPicker), ranges and aggregation (Day, Week, Month, Quarter, Year);
  - chart of directCoins and npcPotential as separate, labelled series, with grossPotential as their labelled sum
    ("Estimated gross gold generation potential from valued creatures" where coverage is incomplete);
  - a hypothetical-liquidation selector labelled as an assumption;
  - a constant-coverage toggle and coverage-change markers (newly valued creature, evidence revision);
  - separate panes or axes for TC price, population and activity, and per-capita or productivity;
  - update and event markers with before/after comparison;
  - indicator tiles per component with kill coverage, valued and unvalued kills and quality (corrections 3 and 13);
  - evidence mode and vintage label (latest-evidence by default) and methodology version;
  - contributions table per component with period comparison;
  - cross-world sortable table with raw and coverage-aware columns and comparability warnings;
  - Findings and Provenance (sources, upstream commits, loot and price revisions, last sync, methodology).
- Markets: a "Forecast history" dock panel with:
  - filters for as-of date, world (from the page), horizon, model, status and evidence level;
  - each edition's reproducibility level;
  - accuracy tables split authentic, unpublished and backtest;
  - a pane-primitive layer drawing up to 3 selected editions (path, band, publication marker with evidence level)
    over actuals, included in the export like Projections.

  Bump the shared `?v=` tags together.

### Stage G: forecast model extension

Integrate a gold-based model into published Projections **only** if Stage E shows a validated out-of-sample gain.
Either way, register the best component challenger as a prospective archived model (`challenger`, not shown as
primary), generated by the daily workflow from point-in-time features. It is published through `publish.py` with a
complete input snapshot (feature values, evidence vintage, code commit), so future comparisons use genuine,
reproducible forecasts.

### Stage A2: automation and data sync (built alongside B, C and D)

- `ci.yml`, `pages.yml` and `tools/release.mjs` are built and activated in Stage A0. Later stages extend
  `validate_site.mjs` (archive and representation integrity per correction 10, leakage tests, new builder
  `--check`s) and `release/policy.json` (data paths allowed in data releases, changed only by a full release).
  Deployment status feeds publication evidence.
- Every automated update ends with `release.mjs --data` after its validated commit, so live data stays current
  while unreleased code never deploys.
- `market-daily.yml`: TibiaMarket incremental fetch (`start_days_ago` small) into dated increment files, plus a
  manifest (build already merges copies and fails on disagreement). Then `build_market_history`, then
  evaluate.py, then commit only if all checks pass; otherwise keep the last dataset and record the failure.
  - Frequency is set after measuring the API's row cadence.
  - All of it runs through `tools/sync_market.mjs`, the same entry point the manual procedure and the on-push
    workflow use (correction 6).
  - Manual input channel `data/market-history/inputs/manual/` (validated schema, source `manual`, observedAt and
    submittedAt) is merged with existing precedence; never overwritten by TibiaMarket.
- `economy-daily.yml` (~05:30 Berlin): kill-stats increment, build_gold, population adapters and status, then
  commit. Weekly loot and price revision sync appends evidence and builds a new derived version.
- `forecast-archive.yml` (on push to main touching projections, ledger or market history; on `deployment_status`;
  plus a dispatch): integrity validation, publish_evidence, evaluate. The user's manual pushes are processed
  immediately, and Pages deployment outcomes become evidence.
- `online-sampler.yml`: */30 cron to the side branch.
- All writers share one concurrency group, rebase before push, never force-push, and are idempotent. Data releases
  dispatch `pages.yml` with their tag.

### Stage H: final validation and docs

- Full `node --test tests/*.test.mjs`, Python suites (tc-cycle 38 tests untouched plus new), `validate.py`,
  builder `--check`s, leakage suite, reproduction of every reproducible archived edition, and Chrome browser suites
  (threaded server, `TIBINANCE_TEST_URL`, Bestie node_modules).
- Docs: `docs/economy.md` covers:
  - sources, limitations, coverage and comparability;
  - loot interpretation and revisions, the two reconstruction modes and the eligibility policy;
  - formulas per component and NPC value treatment;
  - the liquidation-rate and missing-data policies;
  - population definitions and player-hours; mergers;
  - econometric specifications A–E with identification limits;
  - archive semantics, transactional publication and evidence levels;
  - reproducibility levels; evaluation; automation;
  - the distinctions between direct coins, potential conversion, gross potential, net monetary expansion, money
    stock and TC price, and why none is inflation or GDP.
- README and project-guide sections, including the Pages deployment change, the A0 bootstrap sequence, the release
  model (full and data releases, policy, manifest, tags), how Claude Code, Codex or the user releases, and
  rollback. Final five-section report.

## Tests (new, alongside the existing 138 JS and 38 Python)

- `tests/economy-loot.test.mjs`:
  - Loot2 parsing quirks, coin/item separation, ALV parity fixtures, version-date bounds;
  - sample selection at boundaries, overlaps, low-sample, missing periods, name changes and redirects;
  - **retroactive corrections to a sample, multiple revisions of the same sample, NPC price revisions;**
  - **latest-evidence vs point-in-time results, no future-information leakage at as-of boundaries.**
- `tests/economy-eligibility.test.mjs` (correction 11): one leakage test per source and feature family:
  - kills, including upstream rewrites;
  - loot revisions and price vintages;
  - versions, worlds, mergers and events;
  - population sources;
  - rolling statistics and training-only normalization;
  - corrections published after T;
  - uncertain availability excluded from strict mode but kept in descriptive mode.
- `tests/economy-gold.test.mjs`:
  - hand-checked valuation per component; aggregation across creatures, days and months;
  - missing and recovered days, zero kills, incomplete coverage, kill coverage vs valued totals (no known monetary
    share);
  - merges, retired and successor worlds;
  - **directCoins vs npcPotential separation, zero-liquidation and full hypothetical-liquidation scenarios, version
    listing in `gold/versions.json`;**
  - **constant-coverage sets, coverage-change flags (no false growth from newly valued creatures), missing never
    zero.**
- `tests/economy-population.test.mjs`: Wayback parsing and timestamp resolution, irregular intervals, gaps,
  incompatible windows, zero denominators, availability fields.
- `reports/economy/test_*.py`:
  - chronological splits, availability cutoffs (kills, loot revisions, price vintages), lags, metrics, missing data,
    reproducibility;
  - specifications A–E, **never all three components together, rank and condition-number diagnostics for D,
    common-sample comparisons, training-only preprocessing.**
- `tools/forecasts/test_archive.py`:
  - no silent overwrite, idempotent re-run, supersession, model versions;
  - as-of retrieval, evaluation against the correct target week, evaluation supersession;
  - **archived forecasts never published; failed deployment after archival; repository vs website-verified
    publication; backfilled timestamps with uncertain basis; as-of queries excluding archived-only forecasts;**
  - **preservation of published forecast inputs after evidence corrections; input snapshots immutable; prediction
    reproduction from snapshots; missing-input listing for backfills.**
- `tools/forecasts/test_publish.py` (correction 10):
  - unit validation rejects a representation without its archive record;
  - push failure, then idempotent retry;
  - concurrent appends reconciled by `contentHash` without loss or duplication;
  - lock contention;
  - no force-push;
  - the CI check fails on a deliberately inconsistent commit (temporary repository fixture).
- `tests/forecast-archive.test.mjs` for UI logic and evidence-level filtering.
- `tests/release.test.mjs` (Stage A0, on temporary repository fixtures):
  - the artifact equals the release tree byte for byte, minus only `.git`, `.github` and `.cache`;
  - a full release equals its main commit;
  - a data release changes only allowlisted paths and has the previous release as parent;
  - checkpoint edits to existing public files never appear in a data release;
  - validation runs on the candidate tree and a failure produces no tag or manifest;
  - a digest mismatch blocks deployment;
  - tags are never moved or reused, and the manifest log is hash-chained and rebases by content;
  - an empty data release is refused or yields an identical digest;
  - a policy change requires a full release;
  - no force-push.
- Browser: `tests/economy-browser.mjs`, `tests/market-forecast-history-browser.mjs`; all existing suites rerun.

## Continuous checkpoints and cross-agent handoff (supersedes stage-boundary-only commits)

Claude Code and OpenAI Codex alternate on this repository when either reaches its quota. Git (origin/main) is the
source of truth; `PROGRESS.md` is the handoff document; this plan is copied into the repository as
`docs/economy-plan.md` (first commit of execution) so either agent can read it.

- **Checkpoints**: commit and push to main after every coherent unit:
  - a new module or substantial function;
  - a schema or migration;
  - a test suite or significant test group;
  - a working integration;
  - a finished substep;
  - anything substantial before a long-running operation.

  Before a likely context or usage limit, in order: save files, update PROGRESS.md, run the relevant checks, commit,
  push. Partial work may be committed when clearly marked incomplete and when it cannot break the live site. No
  fabricated results. Never discard another agent's changes, never reset to an earlier state, never force-push.
- **Production safety**: checkpoint commits and production releases are different operations (Stage A0).
  - Continuous commits and pushes to main stay mandatory, with no long-lived feature branches. They start after A0
    activation.
  - Production serves only the approved release revision in `release/production.json` (tag `release/NNNN`).
    Checkpoints on main, including incomplete edits to existing public files, are never deployed.
  - Code reaches production only through `tools/release.mjs --full <commit>`, an explicit validated operation run by
    Claude Code, Codex or the user after verification and recorded with its approver. Validated data reaches
    production through `--data` releases (allowlisted paths only).
  - Pages deploys a release only when the exact artifact passes `validate_site.mjs` and its digest matches the
    manifest; a failure leaves the live site unchanged.
  - New features still ship in isolated modules with default-off flags, so a full release of a checkpoint never
    exposes half-built UI.
  - No checkpoint may change a published representation (`results.json`, projections) except through
    `publish.py`, so no partial forecast publication can occur.
  - Pages settings change only in A0 step 5, after the dry-run artifact of release 0001 matches the live site.
  - Every checkpoint is self-contained: its PROGRESS.md update (tests run, incomplete work, exact next action) is
    in the same commit. Checkpoints are pushed continuously, not only near quota limits.
- **PROGRESS.md "Economic intelligence expansion" section**, always current:
  - current stage and substep; completed work; work in progress; remaining tasks;
  - files created or modified; relevant commits;
  - tests run and results; known failures and limitations; decisions made (incl. corrections 1–15 and user
    decisions);
  - current production release (tag, commit) vs main HEAD, and what is awaiting a full release;
  - **exact next action**; long-running jobs with checkpoint and resume instructions.
- **Resumption protocol** (every new session, either agent):
  1. Check `git status` and the branch.
  2. Fetch origin/main.
  3. Read PROGRESS.md.
  4. Read `docs/economy-plan.md` and the relevant docs.
  5. Inspect the latest commits and any uncommitted changes.
  6. Verify what was actually implemented, and don't assume the last task finished.
  7. Continue from the exact next unfinished substep, without redoing completed work or reopening decisions.
- **Every checkpoint commit includes the updated PROGRESS.md** describing the repository state after that commit;
  code is never committed first with PROGRESS.md later. Each checkpoint is self-contained.
- **Long-running operations** record in PROGRESS.md:
  - input source and pinned revision;
  - last successfully processed partition or record;
  - output files and locations;
  - resume command;
  - whether intermediates are committed, cached or local-only, and whether the next agent must regenerate a cache;
  - validation status of completed partitions.

  Uncommitted or local-only artifacts are never described as available to another agent. GitHub Actions caches are
  not assumed to survive or be reachable across agent environments; any dependence on one comes with a reproducible
  recovery procedure.
- On a switch between Claude Code and Codex, the latest origin/main commit and its PROGRESS.md are authoritative.
- **Working branch**: work directly on a branch that tracks main and push each checkpoint with
  `git push origin HEAD:main` after fetch and rebase (merge if rebase is unsafe), so main always holds the latest
  checkpoint.
- Long downloads and the Research or econometric runs go in background jobs with on-disk checkpoints (resume, never
  restart). No subagent swarm.

## Verification (end to end)

1. `node --test tests/*.test.mjs`; `cd reports/tc-cycle && <pinned venv> python -m unittest discover -p 'test_*.py'
   && python validate.py` (ledger untouched); `python -m unittest` in `reports/economy` and `tools/forecasts`.
2. Builders: `node tools/economy/build_gold.mjs --check`, `python tools/forecasts/archive.py --check`,
   `python tools/forecasts/reproduce.py --all`, `node tools/build_market_history.mjs` (byte-identical for unaffected
   worlds).
3. Publication transaction rehearsal in a temporary clone:
   - archive then publish, with a simulated push failure and retry;
   - a concurrent-append reconcile;
   - a deliberately inconsistent commit rejected by the CI validation script.
4. Spot answers on real data:
   - Antica directCoins, npcPotential and grossPotential (from valued creatures, with kill coverage) for
     September 2025, plus top creatures;
   - Antica vs Gentebra per hour where data exists, with comparability notes;
   - late-2025 divergence table per component;
   - A–E R² and out-of-sample tables;
   - "what did Tibinance predict for Antica on 2026-10-01" via the panel (only the 2026-09-28 edition, with its
     evidence level).
5. Browser suites in Chrome against the threaded local server; manual check of Economy and the Markets panel at
   1440, 768 and 390 px in light and dark.
6. After the final full release: `pages.yml` deploys only the validated release revision. A0 checks are rerun:
   artifact equals the release tree, live SHA-256 parity, and a later checkpoint is not deployed. `gh workflow run` each workflow once and
   confirm idempotency (second run commits nothing); publication evidence appears for the deployed commit.
