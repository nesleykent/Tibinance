# Economy: gold generation potential, population and forecasts

[Project overview](../README.md) | [Technical guide](project-guide.md) | [Open the Economy page](https://nesleykent.github.io/Tibinance/economy.html)

How Tibinance estimates the gold that creature kills could bring into each Tibia world, what that estimate is and
is not, how it relates to Tibia Coin prices, and how every forecast Tibinance publishes is archived and graded.
The approved plan, with its fifteen binding corrections, is `docs/economy-plan.md`; the research findings are in
`reports/economy/README.md`.

## The three quantities

| Name | Definition | Status |
| --- | --- | --- |
| **Direct gold drops** (`directCoins`) | Kills of each valued creature x the coins its loot sample expects per kill: gold, platinum and crystal coins at 1, 100 and 10,000 gold | Modelled direct creation of coins from loot |
| **Potential NPC conversion** (`npcPotential`) | Kills x the other items per kill, each at the highest price an NPC pays for it | Potential only: items may be kept, traded, used or never sold |
| **Estimated gross gold generation potential** (`grossPotential`) | `directCoins + npcPotential` | A maximum under the stated valuation, not observed monetary expansion |

Every value covers **valued creatures** only: creatures matched to a TibiaWiki loot page with a sample that applies
on the kill day. Kills of other creatures are counted in **kill coverage** (valued kills / all kills) and never
valued, and a total from valued creatures is never scaled up to stand for the whole world. Where coverage is
incomplete the page says "from valued creatures" and shows the coverage beside the figure.

### What they are not

- **Not net monetary expansion.** Gold also leaves the game: NPC purchases, fees, rent, travel, the Store. None of
  that is measured.
- **Not the money stock.** Nothing here says how much gold exists, only how much kills could add.
- **Not inflation or GDP.** There is no price index of goods and no measure of output or income.
- **Not a Tibia Coin price determinant.** The research tests how prices relate to these quantities; it finds
  associations between worlds and no forecasting gain (below).

**No NPC liquidation rate is assumed.** The schema keeps a slot for evidence about how much loot is actually sold.
Until such evidence exists, "gold plus a share of NPC potential" appears only as a labelled hypothetical scenario
(0, 25, 50 or 100%), drawn dashed and marked "assumption".

## Sources

| Source | Used for | Terms |
| --- | --- | --- |
| Kill statistics from tibia.com via TibiaData, collected daily by [tibiamaps/tibia-kill-stats](https://github.com/tibiamaps/tibia-kill-stats) and its 2022-08-23 to 2025-12-04 archive | Kills and players killed per race, world and day | The repositories carry no license: they are read at pinned commits and **never republished**. Only derived values and SHA-256 digests are committed. |
| TibiaWiki (tibia.fandom.com): `Loot Statistics:` pages, `Module:ItemPrices/data`, `Updates/<version>` pages | Loot samples, NPC buy prices, version release dates | CC-BY-SA, TibiaWiki contributors. The evidence chunks and everything derived from them carry the same license. |
| Tibinance market history (`data/market-history/tibia-coin/`) | Tibia Coin Sell and Buy Offers | As described in the technical guide |
| TibiaVIP worlds list, one snapshot (2026-10-13, supplied by the owner as a PDF) | Characters online and total known characters per world, at one instant | Only the extracted numbers and the file's SHA-256 are committed |
| Internet Archive copies of guildstats.eu pages | Sparse archived windows of players online | Each observation names its capture |
| TibiaData `/v4/worlds` snapshots from 2026-10 | Prospective players online | Existing samples kept on `data/online-samples`; automatic collection disabled |

### Kill statistics

- **Day alignment.** A file dated D reports the kills of server day D minus one. The largest swing in the whole
  series (2 to 4 June 2023, kills on every world roughly doubled) falls exactly on an XP/Skill event with a Loot
  Event, which confirms the alignment.
- **Missing days are never filled by estimation.** Each file's `last_week_killed` is the sum of the
  `last_day_killed` of the seven files ending on it (verified on every race of real days). So a single missing day
  is recovered **exactly** from a later file's weekly counter and marked `recovered`. 601 world-days are recovered
  this way, 2025-12-05 among them; none are missing. A day that cannot be recovered stays missing (`m`), never zero.
- **Ingestion** (`tools/economy/ingest_killstats.mjs`): blobless clones pinned at each repository's HEAD, one sparse
  checkout per month, one compact partition per world and month in `.cache/economy/killstats/`. Per world-month
  digests of the source files and of the partition are kept in `data/economy/sources/killstats.json`, together with
  the commit that first held each date (its availability). Overlapping files of the two repositories must be
  identical; a difference is recorded as a conflict.
- **Races to creatures** (`tools/economy/map_creatures.mjs`): the upstream normalisation map, exact titles,
  redirects and a few fixed singularisation rules. 1,401 of 1,750 races are matched, holding 98.8% of all kills.
  Names shared by several creatures stay unmatched rather than borrow one variant's loot.

### Loot evidence

- **Parsing.** `{{Loot2}}` samples are read exactly as TibiaWiki's own `Module:AverageLootValue` reads them
  (`js/economy-loot.js`). The sum of the two components matches the wiki's rendered "Average loot value" for the 37
  creatures checked.
- **Gold and items.** Gold counts at face value. Other items are valued at the highest NPC buy price in the price
  vintage that applies.
- **Revisions are evidence, append-only.** Every revision of every loot page and of the price module since
  2022-08-23 is kept: a sample's content with the revision that first held it (`availableAt`) and the revision that
  changed or removed it. A sample already present on 2022-08-23 has availability `upper-bound`. Nothing is
  overwritten, so the evidence of any date can be rebuilt.
- **Effective dates.** A sample made under client version V applies from V's release date (`effectiveAt`, from the
  `Updates/` pages). Builds without a dated page are bounded by the nearest dated version below them and flagged.

### Valuation rule

For a kill day d, the applicable sample of a creature is the latest one effective on or before d, preferring one
with at least 100 kills, otherwise the latest, flagged low-sample.

- **Strict (published):** kills before a creature's first effective sample are unvalued and lower kill coverage.
- **Extended and pooled:** sensitivity rules implemented in `js/economy-value.js`. Extended applies the earliest
  sample backwards; pooled uses the kill-weighted mean of all samples effective by d. They are tested, but no
  published build uses them yet.

## Two reconstructions, and what may be used when

- **Latest evidence** (`data/economy/gold/`, the Economy page): the newest validated loot evidence and NPC prices,
  applied by effective dates. A correction made today improves past values; every derived version is listed in
  `data/economy/gold-versions.json`, and the evidence to rebuild earlier ones is never deleted.
- **Point in time** (`node tools/economy/build_gold.mjs --as-of <T>`, kept in `.cache/economy/gold-pit/`): only what
  was available at T. A kill file counts only if its upstream commit is at or before T, a loot sample only if the
  revision holding it is, and the NPC prices are the vintage current at T. Uncertain availability is excluded.

**Rule for every forecast and backtest:** use only information available at the cutoff, whatever period it
describes (correction 11). The econometrics' out-of-sample tests use the monthly point-in-time builds; a feature
may be up to six weeks old at an origin, and its age is reported. The rules are applied inside `build_gold.mjs`,
`js/economy-value.js` and `tools/forecasts/challenger.py`, and tested in `reports/economy/test_economy_research.py`
and `tools/forecasts/test_challenger.py`. A shared eligibility module (`js/economy-eligibility.js` in the plan) was
not built separately.

## Coverage, comparability and missing data

- **Kill coverage** is about 98% on most worlds and weeks. The econometrics exclude weeks under 90% and report how
  many were excluded (none in the current run).
- **Constant creature set.** `grossStable` sums only the creatures valued from the first kill day of the data. Its
  changes come from kills alone, never from a creature becoming valued. The Economy page offers it as a toggle, and
  the research repeats its divergence counts on it.
- **Cross-world comparison.** The Economy watchlist compares worlds on their latest complete period only, never a
  partial one. A world under 95% kill coverage is marked (i, with the coverage), since its figure understates it more
  than most. A retired or merged world is marked R and keeps its last complete period. Values are never scaled up.
- **Missing is never zero.** A missing day has no values. A period's sum states how many of its days had data, and
  growth is computed only between two complete periods. Unfinished periods are not drawn on the chart, because they
  would read as falls.
- **Merged and retired worlds** keep their own series, never chained to a successor. World transfers move wealth
  between worlds and are not modelled.

## Population and activity

- **Players killed by creatures** (`playerDeaths`) comes with the kill statistics for every day. It is an activity
  count, not a population.
- **TibiaVIP snapshot.** "Characters online" is a count at one instant. "Total known characters" counts every
  character TibiaVIP has seen (Gladibra: 163,790 known, 24 online). Neither is an active population, and the
  snapshot is never combined with period totals.
- **GuildStats archived pages.** 179 Wayback captures. Each page's daily, 30-day hourly and 15-minute series are
  parsed, and the meaning of each series (average or peak) is verified per page against its hourly values. Labels
  are Europe/Berlin time, which the 10:15 server-save dip confirms. These are sparse windows, kept as
  `guildstats-wayback`.
- **TibiaData sampler.** Prospective online snapshots from October 2026. Automatic collection was disabled on
  2026-10-14 at the owner's request to stop recurring Actions usage; the schedule was removed. Existing samples
  are retained. `sample_tibiadata.mjs` integrates player-hours only across contiguous samples.

**Unresolved requirements.** Continuous hourly GuildStats history and TibiaVIP active population remain required.
Both sites answer automated requests with a Cloudflare challenge (HTTP 403). Tibinance does not circumvent bot
protection:

- `collect_gated.mjs` records the status in `data/economy/population/access.json`;
- it would collect where a source answers normally, or with the operator's permission (a key or an allowlist as a
  repository secret).

Neither the archived windows nor the sampler is presented as a substitute. Any complete history obtained later can
be imported without redesign: every observation carries `effectiveAt`, `collectedAt`, `availableAt` and its
definition. Until then, gold per active character is shown as unavailable, with the reason.

## Econometrics (reports/economy/)

Weekly world panel: Research weekly median offers, joined with weekly sums of the three quantities. Weeks with a
missing day are dropped, never summed partially.

| Specification | Regressors (logs) |
| --- | --- |
| A | direct gold |
| B | NPC potential |
| C | gross potential |
| D | direct gold and NPC potential, with rank, condition number and variance inflation |
| E | C plus players killed (and the TibiaVIP cross-section for population) |

The three quantities are never regressors together, because the sum is an identity of its parts. Each
specification reports its own fit. The analyses are kept apart:

- association in levels, pooled, within worlds and between worlds, beside unit-root tests;
- week-to-week changes with world and week effects and two-way clustered errors;
- divergence checks;
- out-of-sample forecasts at identical origins against no change and drift, with Diebold-Mariano tests.

No coefficient is causal. An earlier estimate of about 45% of price variation is a reference, never a target.

**Findings** (details and numbers in `reports/economy/README.md`):

- A quarter to a third of the variation in log price levels goes with gold potential, mostly **between worlds**.
  Within worlds over time it is 4 to 13%, and most series are not stationary.
- Changes in gold potential explain almost none of the price changes (within R² at most 0.03).
- Gold up and prices down appears in most worlds in **2026 Q1 and Q2**, not in late 2025. It holds for the
  constant creature set, so it is not an effect of newly valued creatures.
- **No gold-based specification beats the no-change forecast** at 1, 4 or 13 weeks. At 13 weeks four of the five
  are significantly worse.

## Forecast archive (data/forecast-archive/)

Every forecast Tibinance publishes is archived **before** it is published. The archive records what was predicted,
from what, and when it became public. It is never rewritten.

- **Chain.** `publications.jsonl` is an append-only SHA-256 hash chain. Each record has a stable `contentHash`, so
  a record keeps its identity through a reconcile. The record types are forecast, presentation, supersession,
  publication evidence and publication failure.
- **Objects.** Outputs and input snapshots are content-addressed, immutable gzip JSON files in `objects/`.
- **Snapshots.** A snapshot holds the exact inputs a forecast used: series, anchors, configuration, feature values
  and coefficients. Later evidence corrections never change what a forecast recorded.
- **Three times, three states.** `createdAt` is generation, `archivedAt` is the durable append, and publication
  needs **evidence**:
  - `repository`: the first state of main that held the forecast;
  - `website`: a Pages deployment that served it.

  An archived forecast without evidence is never shown as a public prediction. Backfilled times state their basis
  and uncertainty.
- **Transactional publication** (`tools/forecasts/publish.py`):
  1. archive the forecast, then stage one unit (representation, archive, index, any `--with` paths);
  2. validate the unit;
  3. commit it on top of the remote main, reconciling concurrent chains by `contentHash`;
  4. validate the commit's tree again, then push without force.

  A failure publishes nothing. CI rejects any commit whose representation is not archived.
- **Reproducibility.** Prediction reproducibility: `tools/forecasts/reproduce.py` rebuilds the outputs from the
  snapshot. Every Research scenario edition and every challenger edition reproduces. Research reproducibility means
  rebuilding the inputs from the sources at the recorded code commit.
- **Evaluation** (`tools/forecasts/evaluate.py`): when a target week closes, the actual is computed with the
  Research's own weekly rule. The evaluator appends absolute and percentage errors and whether the actual fell in
  the band. A changed actual appends a superseding evaluation; a week without observations stays unavailable.
  Published, archived-unpublished and backtest forecasts are never pooled.
- **Forecast history on Markets.** The Forecast history panel shows what was public on any date, by evidence level.
  It draws up to three past editions over the chart and reports their accuracy as target weeks close.
- **The gold challenger** (`tools/forecasts/challenger.py`). Specification E is archived daily as a prospective
  forecast of the Sell Offer at 1, 4 and 13 weeks. It is never shown as a projection; it accumulates genuine
  forecasts made before their outcomes, so a gold model can be judged later on real out-of-sample evidence.

## Automation and releases

| Workflow | What it does |
| --- | --- |
| `economy-daily.yml` (03:30 UTC) | Kill statistics increment, loot evidence on Mondays, gold rebuild, challenger, one publication unit, data release |
| `market-daily.yml` | TibiaMarket sync through `tools/sync_market.mjs`, also population access status |
| `forecast-archive.yml` | Publication evidence and evaluations after pushes, deployments and daily |
| `online-sampler.yml` | Disabled; no schedule. Manual collection to `data/online-samples` requires explicit re-enabling |
| `ci.yml` | Site validation and every Python suite on each push |
| `pages.yml` | Deploys only an approved release (`docs/releases.md`) |

**Caches.** The kill partitions and wiki revisions live in the Actions cache, as temporary storage only. When it is
evicted, the same commands rebuild them from the pinned sources in about two hours each, and the committed digests
prove the result matches. Locally, run:

```bash
node tools/economy/ingest_killstats.mjs
node tools/economy/fetch_loot.mjs
node tools/economy/map_creatures.mjs
node tools/economy/build_gold.mjs
```

`node tools/economy/build_gold.mjs --check` fails unless `data/economy/gold/` is a fresh build; it needs the
partitions.

**Production.** Pages serves only an approved release, so economy data reach the live site through data releases.
`release/policy.json` lists `data/economy/**` from the release that approves it.

## Remaining limits

- **NPC prices** are TibiaWiki's vintages. Prices before 2022-08-23, and prices that never reached the wiki, are
  unknown.
- **Loot Event days** are understated, because the samples are normal-time loot.
- **Not built yet:**
  - the planned world registry (`sources/worlds.json`, with merger lineage);
  - coverage-change flags per creature;
  - binomial and empirical uncertainty of loot values.

  Until they are, intervals are not shown.
- **Sensitivity rules** (extended, pooled, gold-only, alternate samples, ±1 day) are implemented or trivial, but
  not yet published as builds.
- **Population history** is the open requirement above.


## Interface reconstruction, 2026-10-14

The token reference is `b7eb0e4`, the implementation immediately preceding the economic-intelligence expansion.
Its shared declarations in `css/app.css` and `reports/tc-cycle/report.css` are unchanged. Economy and forecast
history use those existing tokens directly; they define no replacement palette, sizing or typography tokens.
The reference supplies tokens only: no earlier interface or functionality has been restored.

Economy uses one persistent Lightweight Charts instance and timeline, with independent Gross, Gold and NPC
visibility controls above a short kills pane that can also be hidden. Values are gold per day: a day's total or a complete week's/month's total divided
by its calendar days. The world watchlist uses the same rate functions and latest complete period as the chart;
retired worlds appear when searched, with their end date. Missing/unfinished periods have no rate, and are never
represented as zero. The selected range controls the comparison of complete periods, not a sum of partial periods.

Tibia Coin price is shown by default and has a labelled toggle beside the gold series. Its TC Sell Offer medians
use the independent left gold-per-TC axis, including when accumulated gold uses the logarithmic right axis.
Hiding the price persists as `price=0` in the URL. Worlds without overlapping price observations disable that
control; no price is invented. The resting readout labels the latest observed price period when the latest gold
period has no price, and crosshair readouts retain their exact period. Missing gold does not suppress observed TC
prices. The constant creature set and all five labelled liquidation
rates, including 75%, are separate overlays. Resizing or changing comparisons preserves the explored time window;
All can show the full daily history at phone widths. Axis labels use K (thousand), M (million) and B (billion); full figures,
coverage and price sample counts remain in Help's keyboard-scrollable Chart values and coverage table. Rates are
rounded to whole gold/counts for display, matching the readout. No uncertainty interval is invented. If the chart
library is unavailable, the controls, world details and data table remain usable; image export is disabled.

Daily avg shows gold per day on a linear scale. Accumulated uses a logarithmic gold scale and sums the raw daily components inside the exact inclusive selected-range
boundaries, through the latest complete interval. A boundary week/month is clipped to the selected dates rather
than included in full. Recovered days count; missing days are excluded, and later subtotals state cumulative days
with data and are labelled partial. Entirely missing bins stay blank. Gross remains gold plus NPC potential,
not money supply or realised NPC sales. Constant-set and liquidation gold overlays follow the same mode; kills
remain counts per day on their own linear scale and TC remains gold per coin. Players killed is omitted from the interface. The readout, accessible chart description, Help table and PNG
export identify the mode and its coverage. The watchlist and world details remain daily averages, clearly labelled.

World, visible series, gold mode, kills visibility, interval, range and comparison settings remain in the URL.
Existing `measure` links still select that series. New `series` links can retain multiple or no gold series; the most
recent enabled measure drives the headline and daily watchlist. Series are native toggle buttons with independent
Tab/Space/Enter interaction. Radio groups for mode, interval, range and liquidation support arrows, Home and
End with one tab stop per group. World and performance actions preserve keyboard focus when their rows rebuild.
A world identity is committed with its successfully loaded data; failed/stale requests cannot relabel the previous
world's figures. Initial and world-specific failures offer retry without losing the last valid view.

Creature contributions remain monthly because the source files preserve monthly top lists. The Creatures panel
keeps its month selector, top 30, Other total, kills, per-kill components and shares. No dataset or numerical model
was changed by this interface audit. The original palette, typography and spacing tokens remain unchanged.

Forecast-history as-of views use repository evidence when that was available before a later website deployment.
Website-only filtering does not misclassify repository-published editions as never published. Accuracy views
exclude later evaluations and retain only corrections archived by the selected date. The immutable archive,
input snapshots, published forecasts and research ledger are unchanged.

The pre-existing gaps documented above remain: historical active-population inputs, dated world metadata,
coverage-change/event markers, full shared temporal eligibility and validated loot uncertainty. The page identifies
the version-date bounds and incomplete strict historical validation rather than presenting them as completed.
