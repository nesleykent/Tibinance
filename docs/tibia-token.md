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
The Events calendar/agenda accepts presentation labels for an asset. TIB uses
only explicitly token-related global events; their dates remain server days,
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
