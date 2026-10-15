# Tibia Token in Markets

Markets routes assets with `asset=tibia-coin` (default) or
`asset=tibia-token`. A TC world remains a selection within TC; TIB never enters
the world index or capture database. The shared header has an Asset picker.
Example: `markets.html?asset=tibia-token&range=1Y`.

TIB identity is the supplied official contract
`0x111B95C2b65CbA53aB4E0AaDA12f55985045E446` on BNB Smart Chain.
The initial venue is the PancakeSwap V3 TIB/USDT 0.25% pool
`0xd2acfaec0e3b556f285fbb9026ede7e87885e611`.
Pool metadata and every OHLCV response must identify this exact base token;
matching a symbol is insufficient. The quote token is USDT
`0x55d398326f99059ff775485246999027b3197955`.

The frozen source is GeckoTerminal's public pool API, with `currency=usd`,
`token=base`, daily aggregation, and `include_empty_intervals=false`.
Prices are the provider's USD valuation, not raw USDT units. Volume is pool
trade volume in USD, not TIB quantity, global volume, or TC transactions.
Candles use UTC calendar days, rather than the Berlin 10:00 server day.
The acquisition day's incomplete candle is excluded. Daily OHLC and volume
are retained; the chart draws the daily close and pool volume, and its readout
gives each candle's open, high and low beside the close, as a terminal reads a
bar. Like Tibia Coin, the chart's status stands over its top and the price scale
starts below it.

Initial coverage is 363 completed days, 2025-10-06 through 2026-10-03.
The public API rejected earlier pagination with HTTP 401. Launch-to-present
coverage is not claimed. Missing dates stay gaps and prices are never filled.
The asset details panel states coverage, venue, units and contract and links to
[the pool](https://www.geckoterminal.com/bsc/pools/0xd2acfaec0e3b556f285fbb9026ede7e87885e611).

`js/market-chart.js` accepts an asset profile defining its layers, price precision
and formatting. TC keeps the existing layers. TIB supplies price, USD volume
and the existing Events layer, without best offers, TC Statistics or forecasts.
`market-export.js` builds the offscreen chart with the same profile. Shared
calendar ranges, changes, gap lines, dock and marker UI remain canonical.
The Events calendar/agenda and canonical collection are shared across all assets
and worlds. TIB never selects its own event universe; event dates remain server days,
and the help explains the UTC difference. Focusing a pre-coverage event adds
axis whitespace but no prices; choosing a range restores observed coverage.

## Reproduction and refresh

```sh
node tools/build_tibia_token.mjs
node tools/build_tibia_token.mjs --check
node --test tests/tibia-token.test.mjs
```

Refresh public source snapshots with `node tools/fetch_tibia_token.mjs`, then
rebuild and review the diff. The refresh verifies the base token, paginates,
keeps earlier acquired candles as public access rolls forward, and records
provider coverage restrictions. An unexpected request failure aborts before
writing snapshots. Credentials are not required or stored. Historical access
before the public cutoff can be added later as another verified input.

Browser verification: `tests/tibia-token-browser.mjs` uses the same external
Playwright runtime convention as the existing Markets tests. It checks token
prices and UTC labels, ranges, TC/TIB switching, absence of worlds/sides/TC
forecasts for TIB, token event focus/visibility, PNG downloads, mobile overflow,
and history loading failures. Chrome and WebKit are supported.
`TIBINANCE_CHART_LIBRARY` can supply a local copy of the exact pinned production
chart library for testing; the page retains its integrity check.

## Later TIB versus TC comparison

Start with indexed returns rebased to 100 on a common observed date, with
explicit labels: TIB USD daily close versus one world's TC Sell/Buy offer in
gold. This compares movement, not exchange value. Keep sides separate and
restrict samples to observed overlap; do not carry values through gaps. Align
UTC candles and Berlin server days using a declared cutoff before correlations
or event studies. Offer quotes are not executed trade prices.

A direct price ratio is dimensionally gold/USD, not an arbitrage spread.
An economic conversion comparison needs a separately sourced gold/USD quote,
time alignment, current TC/TIB conversion fees, DEX trading fees, blockchain
costs and liquidity. Historical fees need dated source records. None of those
are silently assumed by this implementation.

## Aggregate TC indicator exploration

The 2026-10-03 TC index has 116 histories, including 96 active worlds. Of those,
93 have quotes and only 38 have a quote on the latest dataset day. Therefore a
median of all latest values mixes dates and can look like a current global
price while mostly using stale observations. The index already has the dates
needed for an explicit coverage/freshness indicator.

Useful candidates for a later TC overview:

| Indicator | Definition | Required guardrail |
| --- | --- | --- |
| Coverage and freshness | Worlds observed on the selected day / active worlds, plus quote-age distribution | Show missing worlds; use lifecycle membership for historical denominators |
| Median TC quote and dispersion | Separate cross-world median and interquartile range for Sell and Buy, in gold/TC | Same-day observations, sample count, region/PvP strata; no stale carry-forward |
| Normalized TC movement | Equal-world-weight mean or median of each world's indexed price change | Fixed eligible cohort and shared observed baseline; report coverage and world-entry effects |
| Relative quoted spread | Median of `(sell - buy) / ((sell + buy) / 2)` for paired same-day quotes | Quotes must be contemporaneous; this excludes execution costs and fees |
| Trading activity breadth | Fraction of eligible worlds with positive canonical daily transactions, by side | Completed daily windows only, never rolling 30-day counts or inferred traded quantity |

These are descriptive market measures, not tradeable indices. The first useful
addition is coverage/freshness, followed by a same-day median and dispersion
with visible coverage. A global market capitalization, gold supply, TC traded
quantity, or turnover cannot be recovered from these offer histories and raw
transaction counters. Retirement and merge histories must retain their own
identity rather than splice into a successor. Aggregate indicators remain an
exploration until cohort and coverage rules are implemented and validated.

Returning-visitor regression: set `TIBINANCE_STALE_CHART` to a local copy of
the pre-TIB `market-chart.js` when running the browser test. Its unversioned URL
is served with that old module; the token page and its PNG export must still
load the versioned implementation. The test also reloads with the dock closed.

## Currency conversion and official purchase costs

Select **Coin costs** on the TIB chart to compare every supplied CipSoft package
in EUR, BRL, USD or theoretical TIB units. The original TIB terminal remains
USD-based, including its volume, replay and PNG export. Currency preference
belongs to the comparison and is remembered locally. The comparison's history
uses the same Markets chart builder, calendar range helper, gap conventions,
theme and responsive tokens. The history table is an accessible canvas alternative.

`data/coin-prices.json` is the manual, dated price ledger. The initial record is
exactly the user-supplied October 15, 2026 list. To update, **append** a full
observation with its actual effective date, observed date, source note and all
package prices; preserve earlier observations. Keep EUR as the fixed commercial
reference until CipSoft explicitly changes it; enter actual BRL and USD prices
independently. Use `null` for unavailable packages. There is no CipSoft scraper,
API request, inferred historical price or automatic adjustment.

Conversions use one ECB publication's EUR-based BRL and USD legs. USD/BRL is
BRL-per-EUR divided by USD-per-EUR. TIB units per EUR = USD-per-EUR / the existing
GeckoTerminal USD close. Every source/target combination follows
`amount / unitsPerEUR[source] * unitsPerEUR[target]`. Values stay unrounded until
formatting; ordinary money has 2 decimal places, TIB 4, and per-TC values 5.
Official originals never change. The comparison displays each route's premium
above the cheapest, savings and savings divided by that route's original cost,
plus pairwise BRL/EUR, USD/EUR and USD/BRL purchasing-price differences. Ties are
labelled. Gas, IOF, processing fees, spreads and trading fees are all excluded.
TIB amounts are market equivalents; they establish no TC redemption facility.

Current comparisons disclose separate FX and TIB observation dates and the FX
retrieval timestamp. Both fiat legs always share a publication date. They are
reference rates rather than executable retail quotations. A TIB close over two
calendar days old, or FX over four calendar days old, is labelled stale.

History offers all three FX pairs, TIB in the selected fiat currency, package
cost, TC purchasing power per TIB, and BRL/USD premiums to the fixed EUR
reference. Selecting TIB units for TIB's own value chart explicitly shows USD
instead; a constant TIB/TIB line would convey no market movement. Fiat-only
analyses use actual ECB publication dates. TIB analyses join each completed UTC
candle to the most recent prior publication within four days, disclosing the
original FX date, including over weekends and holidays. Nothing uses future
rates; longer gaps stay missing.

**Dated manual observations** apply only from each effective date until the next
manual update. No prices are asserted before October 15, 2026. **Constant-price
scenario** holds the latest supplied list constant across earlier market data
and explicitly labels these values hypothetical. This is the only way the new
price list participates in earlier purchasing-power analysis. Missing TIB closes
and unavailable purchase currencies are not filled or treated as zero.

## Foreign exchange acquisition and API decision

Research and live endpoint checks were performed October 15, 2026. Primary docs:
[Frankfurter v2](https://frankfurter.dev/),
[ECB reference-rate methodology](https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html),
[ECB copyright](https://www.ecb.europa.eu/services/using-our-site/disclaimer/html/index.en.html),
[ExchangeRate-API open-access terms](https://www.exchangerate-api.com/docs/free),
[Fawaz Ahmed API](https://github.com/fawazahmed0/exchange-api).

| Source | Accuracy / provenance | Updates / history | Free access / terms | Decision |
| --- | --- | --- | --- | --- |
| Frankfurter, restricted to ECB | Identifiable central-bank reference publication; both tested legs matched ECB's publication exactly | Working-day observations, normally around 16:00 CET; date and range queries; coverage depends on currency/provider | No key or subscription; no daily/monthly quota, abuse throttling; open-source API; local historical storage encouraged; ECB reproduction with attribution permitted | Selected: reproducible paired observations, source attribution, history and persistence |
| ExchangeRate-API Open | Provider aggregation, reference conversions; observation time differs from ECB | Daily; open endpoint supplies current rates, historical service is separate | No key; attribution required, rate-limited; caching/commercial conversion allowed but redistribution prohibited | Rejected for this publicly persisted historical dataset |
| Fawaz Ahmed currency API | Community aggregation; not a single central-bank methodology | Daily dated snapshots, history through date-versioned URLs; no range query | No key; advertises no limits, CDN with alternate host; CC0 repository | Rejected: less specific provenance and many daily requests for a history backfill |

All three tested latest endpoints returned HTTP 200. Results differed because
of observation date/time and methodology; one live check does not establish an
uptime guarantee or a retail execution price. ECB's October 15 publication and
Frankfurter both gave EUR/BRL 5.6679 and EUR/USD 1.1208. ExchangeRate-API's daily
snapshot at 00:02:31 UTC gave 5.627719 / 1.118043; Fawaz's October 14 snapshot gave
5.63621674 / 1.12109235. Frankfurter's tested October 6-12, 2025 range returned five
complete paired working-day publications and no weekend observations. The initial
persisted backfill contains 268 paired publications from September 29, 2025
through October 15, 2026, overlapping all 374 existing TIB candles. No paid SLA is
assumed. Last validated persisted data and explicit age indicators handle outages.

`tools/fetch_foreign_exchange.mjs` fetches only ECB EUR/BRL and EUR/USD together,
validates positive rates, real dates, matching days, uniqueness and ordering,
and writes atomically after validation. Incremental refresh rechecks the prior
week for source corrections and keeps older observations. Three bounded request
attempts handle transient failures; malformed, incomplete or regressing responses
leave the previous snapshot intact. The API provides observation dates, not exact
publication instants: retrieval time is stored separately, never invented.
The browser loads the same-origin persisted snapshot (no browser API dependency),
keeps a validated local cache as an outage fallback, and checks for refreshed
snapshots hourly or on returning to the tab. Refresh also reloads the existing
contract-validated TIB feed; it introduces no additional token provider.

The daily token/currency workflow uses the existing acquisition and validated
market publication/release path, sharing the repository's data-writer lock.
`release/policy.json` includes FX and manual prices for later data releases;
like every policy change, that inclusion takes effect with the next full release.
A push to main is a checkpoint and does not automatically deploy new feature code.

Verification commands:

```sh
node tools/fetch_foreign_exchange.mjs
node tools/fetch_foreign_exchange.mjs --check
node --test tests/coin-costs.test.mjs
npm run lint
npm run typecheck
node tools/ci/validate_site.mjs
TIBINANCE_NODE_MODULES=/path/to/node_modules node tests/coin-costs-browser.mjs
```

Browser verification supports the same Chrome/WebKit external runtime convention
as the existing TIB tests. It checks all 18 original-price rows, selected currency
calculations, all seven analysis metrics, observation/scenario boundaries,
320/768/1024/1440px overflow, keyboard focus/Escape, stored preferences, stale and
cached states, failed refresh and retry, and switching back to Tibia Coin. Browser
screenshots stay outside Git.
