# Tibinance

**Tibia Coins market tracker.**
A static site for GitHub Pages. Drag in your daily Tibia market screenshots; the
browser hashes them, reads the Sell/Buy tables, resolves the world through
TibiaData, and stores **only anonymous market data**. It also accepts Tibia Coins Details / Statistics screenshots as a separate capture type. Existing worlds also get
their price history backfilled from TibiaMarket, so a new screenshot continues
a timeline instead of starting one.

No backend, no build step, no API key, no cost.

## Navigation

Capture, Markets, Trade and Research share one header, `Tibinance / Section`.
Tibinance links home, and the section's name opens a small menu of the four sections
with the current one marked. On Capture, the home page, Tibinance itself opens the menu.
The right of the header belongs to the section: Research keeps its world picker
(All Worlds, searchable) and the edition's language there. The header is
`css/site-header.css` and `js/site-header.js`.

## Research

[**Tibia Coins: Price Dynamics, Predictability and Execution**](https://nesleykent.github.io/Tibinance/reports/tc-cycle/) is an interactive research report covering every world in its Market capture export. It follows one inferential chain, from data construction and the empirical structure of the Market through cycles, competing models and out-of-sample validation to prospective scenarios, execution frictions, differences across worlds and robustness checks, and it treats Sell Offers and Buy Offers separately throughout. It is published in two editions built from the same data: [English](https://nesleykent.github.io/Tibinance/reports/tc-cycle/) and [Brazilian Portuguese](https://nesleykent.github.io/Tibinance/reports/tc-cycle/pt-br.html), the latter keeping every financial, statistical, Tibia and game term in English.

The analysis uses [TibiaMarket’s public API](https://api.tibiamarket.top/docs) and the supplied Market captures; the page reads every count and date from its data files. Daily averages are compared separately and never substituted for Sell Offers, Buy Offers or verified transaction prices. Forecast ranges and simulated probabilities are conditional on the model and the historical sample, with backtest limits stated in the report. [Read the methodology, source data and reproduction guide](reports/tc-cycle/README.md).

## Markets

[Markets](markets.html) is a market terminal for the Tibia Coin history of every
tracked world. The chart fills the viewport under the header: the world and
its quote head it, the 1M / 3M / 6M / YTD / 1Y / All ranges sit below it. Legends on the chart follow the crosshair
(server day, best offer with its change from the previous observation, daily
average, transaction activity), and the latest best offer is marked on the price scale. The
page keeps the same outer margins as Capture and Research.

At its right edge, the tool rail leads with the market side, a compact Sell /
Buy switch, then holds two kinds of tool (`js/markets-dock.js`): panel tools,
which open a panel beside the chart, and direct actions. **Worlds**
opens a dense, separately scrolling watchlist (latest best offer and its
absolute and percentage change over the selected range) and the selected
world's details; **Events** shows or hides the event markers (below), a choice
remembered in the browser rather than the address; **Projections** shows or
hides the Research's offer scenario (below), off until shown and likewise
remembered in the browser; **Help** explains how to read
the chart. One panel is open at
a time. Closed, the panel gives its width back to the chart, which keeps
showing the same days; the open panel is remembered in the browser. Until
then, Worlds starts open on screens wide enough to keep the chart roomy beside
it. **Export** saves a PNG of the chart itself, not of the page: the world,
its latest best offer and change over the range, the legend, Best Offer, Daily
Average and transaction activity over the days in view, axes and dates, and a discreet
Tibinance mark. It is drawn from a second chart built offscreen from the same
state (`js/market-export.js`), so every image has the same layout at twice the
pixels or more, from any window. **Full screen** takes the whole terminal,
rail included. Phones show the rail as a row under the chart and list the
worlds below it. The chart is built from layers (`js/market-chart.js`); a
layer added there, such as events or projections, is drawn on the page and in
every export alike.
Selecting a world updates the chart and the address
(`markets.html?world=Gentebra&side=sell&range=1Y`), so a view can be linked.
The page presents one market history; it does not label where each value came from.

The watchlist lists every current Tibia world; a world without market data yet
shows N/A until captures provide it. Retired worlds with market history are kept
for historical analysis: a search reaches them, they are labelled Retired
wherever they appear, their history stays separate from the world they merged
into, and their ranges end on their last observed day.

The price pane shows two measures and never substitutes one for the other:

- **Best offers** (dots): the best Sell or Buy Offer, one point per server day
  (the day's last observation). A solid line joins consecutive server days; a
  dotted line joins two real observations across server days that were not
  observed. Nothing is added inside a gap, including the September 2026 gap.
- **Daily average** (grey): the average price of the trades that filled that
  side's offers during a server day, joined by the same solid / dotted rule.

The activity bars, along the foot of the price pane on their own hidden scale, show the raw Number of
Transactions per completed server day on that side. Actual traded TC quantity is unknown. Daily
figures end where their history ends (for most worlds in early to mid September
2026); they are never derived from 30-day Statistics. Changes compare the latest best offer with
the last one observed on or before the start of the range.

### Market events

Events are dated facts drawn over the chart as markers along its foot, each at
its actual server day: a world opening, merge or retirement, a major update, an
XP/Skill or Rapid Respawn event, a market change or a Store, Premium or Tibia
Coin change. A marker carries its category's mark (N, R, M, U, XP, RR, E, S) in
its group's colour (the world's own lifecycle, the game, the market); an event
lasting several days underlines them. Markers that would overlap become one
marker showing their count, so nearby events stay readable at any range.
Pointing at, focusing or tapping a marker shows each of its events' days, title
and description, and spans its days across the chart. The markers are one tab
stop: the arrow keys, Home and End move between them in time order, and Escape
closes the details. Hiding the layer leaves the market series, ranges and
address untouched.

A world sees the global events and the events that name it; one event may name
one world, several, or all. A world's own lifecycle events within the history's
years also bound its time axis, so they are plotted where no price was observed:
Jacabra's merge on 2025-11-06 after its last offer, Luzibra's opening before its
first market day. Ranges still count back from the world's last market day.

Export draws the same markers, from the same layer, and adds notes under the
chart: a key per category shown (recurring categories with their count), then up
to six other events one per line with their days, mark and title, then how many
more. Hidden on the page, events are absent from the image.

The data lives apart from the market history, in `data/market-events/events.json`,
generated by `tools/build_market_events.mjs` from facts the repository already
holds: completed merges from the retired-world facts
(`data/market-history/inputs/retired-worlds.json`), announced merges from the
research's `mergers.json`, XP/Skill and Rapid Respawn intervals from the
research's TibiaMarket event dumps (`source-package/events_intervals.json`),
updates and Tibia Token changes from the research's `extra_events.json`, and,
in `data/market-events/inputs/events.json`, the category definitions and the few
facts found only in prose (openings, Premium and transfer changes), each with
the official source the repository already cites. Every event keeps its
provenance; the chart never shows it. An event runs from one server save to
another, so a TibiaMarket interval's last listed calendar day, which holds only
the morning before the save, is not one of its server days.

```bash
node tools/build_market_events.mjs
```

`--check` fails when the committed file differs from a fresh build;
`tests/market-events.test.mjs` runs the same check and validates the dataset
(categories, dates, worlds, merges, sources, order and copy rules).

### Market projections

Markets has no forecasting model of its own. Shown, the projection layer draws
the Research report's offer scenario for the selected world and side
(`reports/tc-cycle/analyze.py`, `results.json` `worldForecast`): the equal-weight
C+S+H ensemble (Constant, Seasonal 52 weeks, Harmonic with trend and two annual
harmonic pairs, fitted on at most 130 weeks of Antica's weekly medians), moved to
each world's own anchor by Antica's proportional change, weekly for the 52 weeks
the Research publishes. Uncertainty is the Research's heuristic stress band
(observed backtest error, divergence between the three models and the world's
premium instability over Antica), which is not a confidence interval and is
never called one. The Research's conditions are kept: a stale anchor and crossed
central sides make a week conditional, an announced merge suspends the scenario
from the merge week, and its confidence (limited for a merge, a stale quote or
fewer than ten transfer tests) is stated.

Projected values never look like observations: the days after the last
observation are faintly tinted behind a hairline boundary labelled Projection,
the central path is a dashed ink line without dots, and the band is a faint fill
in the side's colour. The path starts on the last observed best offer itself,
so there is no gap to explain. A scenario is placed only when the Research's
anchor is that very observation (same server day and price; a capture dated by
its local calendar day resolves to its server day); a newer observation makes
it unavailable until the Research is rebuilt, never moved to another anchor.
Worlds outside the Research's capture universe, retired worlds and worlds
without market data show why they have none. The band does not widen the price
scale, so a world with a very wide band keeps its history readable; the band is
cut at the pane's edge and its values stay in the readout.

The readout gains a Projection row: at rest the scenario's last week, its band
and its conditions; over a day after the last observation, the projected week
that holds it (weeks are labelled by their last day; days are never
interpolated). The window ahead is as long as the range behind, up to the
horizon (1M shows a month ahead, 1Y and All the 52 weeks); the selected range
and the address are unchanged. Events stay in the history and keep working.
Exported images draw the same layer and add two lines under the chart: the
scenario, its start and its central value on the last week shown, and the band
with its nature and conditions; the header names the last observed day.

The projection state is a viewing preference kept in the browser, like Events,
not in the address: a linked view stays the same market view for everyone, and
the projection depends on the Research edition anyway.

```bash
node tools/build_market_projections.mjs
```

It copies the scenarios, rounded to whole gold, into
`data/market-projections/tibia-coin.json` with the hash of `results.json`, and
checks every week, condition and anchor; `--check` and
`tests/market-projections.test.mjs` fail when the file is not a fresh build.
Rebuild it after rerunning the Research.

### Market history dataset

The page reads only `data/market-history/tibia-coin/`, generated from frozen
inputs. It is separate from `data/observations.json`; the Database page and the
research do not read it.

- `index.json`: input files with their SHA-256, conversion counts, and one
  summary per world: status (`active` or `retired`, with `offline` and
  `mergedInto`; a successor lists `formedFrom`), type, BattlEye, location, and
  its complete daily best-offer closes for the watchlist.
- `worlds/<world>.json`: `observations` (`capturedAtUtc`, `serverDay`, `sell`,
  `buy`, the captured volumes and gold figures where they exist, and
  `statistics30d`) and `dailyStatistics` (per server day and side:
  `transactions` as raw activity counters, `highestPrice`, `averagePrice`, `lowestPrice`).

TibiaMarket.top `item_history` snapshots are read from the research's frozen
copies (`reports/tc-cycle/inputs/api/`, never changed here) and from the
dataset's own frozen inputs in `data/market-history/inputs/`:

- `tibiamarket/<world>.json.gz` and `manifest.json`: more worlds and newer copies,
  gzipped as received, with URL, retrieval time, row count and the SHA-256 of
  the raw JSON. Copies of one world are merged by timestamp; a row present in
  two copies must be identical, or the build fails.
- `worlds.json`: a dated TibiaData snapshot of the current worlds (type,
  location, BattlEye). It is not synchronised; a later snapshot replaces it.
- `retired-worlds.json`: offline date, merge target, type, location and BattlEye
  of each retired world that has market history, with its TibiaWiki source.
  A world with market data that is neither current nor listed here fails the build.
- `best-offer-exclusions.json`: individually reviewed source snapshots whose
  best-offer pair is not published, each identified by world and source
  timestamp, with the prices it withholds and the reason (for example a partial
  snapshot, `is_full_data: false`, whose best Buy Offer contradicts its own
  listing). The raw rows stay unchanged and the snapshot's other data (30-day and
  daily statistics) remains. It is a reviewed list, not a rule: an entry that no
  longer matches its source row, or matches none, fails the build.

They are converted to these Tibinance names: `sell_offer` / `buy_offer` become `sell` /
`buy`, the `month_*` fields become `statistics30d`, and the `day_*` fields become
`dailyStatistics`, all validated by the same Statistics contract as captures.
`-1` means not collected and becomes an absent field. A snapshot's `day_*` values
describe the completed server day before the snapshot's own: they change exactly
at the 10:00 Europe/Berlin save, and thirty consecutive days sum to the 30-day
transaction counts. Every best-offer pair needs positive whole prices and an
uncrossed book (Buy below Sell). The research's 80% floor (Buy at least 80% of
Sell) applies to screenshot captures only, where an extreme spread usually means
a misread price; TibiaMarket history keeps genuinely wide spreads, which are real
on thin worlds. Server days open at the 10:00 Europe/Berlin save and are labelled by its
date. Days reported two different ways are dropped rather than resolved.

Freeze more inputs, then rebuild after them or after installing a new
`data/observations.json`, and commit the result:

```bash
node tools/fetch_market_history.mjs --worlds --refresh=Antica
node tools/build_market_history.mjs
```

The fetch tool only adds worlds that are not frozen yet, plus those named in
`--refresh`; `--worlds` replaces the TibiaData snapshot. It spaces requests and
backs off on rate limits like the research's `fetch_api.py`.

`--check` fails when the committed files differ from a fresh build;
`tests/market-history.test.mjs` runs the same check.

## Trade

[Trade](trade.html) answers one question at the moment of trading: trade at once
against the offers already in the Market, or create an offer of one's own? The
player copies what Tibia's Market shows and says what they want to do; nothing on
the page is read from the market history or the captures, and nothing is kept.

- **Your order**: Sell or Buy, and the amount of Tibia Coins.
- **In the Market now**: the top row of the Sell Offers and of the Buy Offers,
  Amount and Piece Price, laid out as the Market lists them.
- **Your offer** (optional): the Piece Price one would ask or bid.

Numbers can be typed plainly, grouped (`38,520`, `38.520`) or with Tibia's `k`
and `kk` (`38.5k`); a field is written back in full when it is left. A decimal
without `k` (`38.52`) is not read rather than guessed.

The page then compares, for the whole amount:

- **Sell now / Buy now**: accepting the entered offers. Only the amount those
  offers hold is priced; the rest is shown as unsold or not bought, and no
  deeper price is assumed.
- **Create Sell Offer / Create Buy Offer**: one's own offer for the whole amount,
  with the Market fee.
- **Sell now, offer the rest / Buy now, offer the rest**: when the entered
  offers hold only part of the amount, taking them and offering the remainder.

It shows each one's gold now, Total Price, fee and net result, the best of those
that cover the whole amount with its difference in gold and percent from the next
best, and the **break-even offer price**: selling, the lowest Sell Offer price at
which an offer that fills nets at least as much as selling now (buying, the highest
Buy Offer price at which it costs no more). It needs no offer price of one's own.
On equal results, trading now leads, since it does not wait on an offer. An offer's
figures hold only if it fills completely at its price: the page does not estimate
whether or when it will, and says so.

Rules applied (CipSoft, ["The Market"](https://www.tibia.com/gameguides/?section=controls_trading&subtopic=manual),
Tibia Manual, the research's source for the same fee):

- Accepting an offer has no fee. Placing one pays 2% of its Total Price, at least
  20 and at most 1,000,000 gold, taken from the bank when it is placed (with the
  price itself, for a Buy Offer) and lost if it is cancelled.
- One offer holds at most 64,000 items, so a larger amount takes several offers,
  each paying its own fee; one character holds at most 100 offers.
- Tibia Coins trade in lots of 25. Prices are whole gold up to 999,999,999,999.
- An offer priced at or past the best offer on the other side would be matched
  against it at once, fee included, so it is refused as an offer: trading now does
  the same without the fee. A Buy Offer at or above a Sell Offer is a crossed book
  and is refused, as the market history refuses one.
- The manual does not say how 2% is rounded to whole gold. The fee is rounded up,
  so it is never understated; it can differ from the client's by 1 gold.

The arithmetic is `js/trade-strategies.js` (pure functions, BigInt gold, so the
largest orders stay exact); `js/trade.js` reads the fields and writes the words.
The engine already takes any number of rows per side; the page enters one.

## Building the dataset

Drop screenshots, review and correct what OCR read before saving, see every
individual capture (including several from the same world), and import, export
or delete data. Analysis lives in the [research report](#research). This is
also where the privacy boundary lives; see below.

## What is stored, and what is not

Stored snapshot fields:

`World, Type, BattlEye, Sell, Captured Sell Depth, Quoted Sell Gold Notional, Buy, Captured Buy Depth,
Quoted Buy Gold Notional, Amounts at best prices, Capture Date, Screenshot Hash`

Each capture also stores its processing version and visible offer observations:
`Side, Row Position, Amount, Piece Price, Total Price, Ends At, Offer UUID,
Matching Ambiguity`. No character or offer-owner names enter these observations.

### Gold supply and demand

Two aggregates over every visible offer, not just the best one:

| | |
|---|---|
| **Quoted Sell Gold Notional** | `Σ (sell amount × sell price)` — the gold sellers are asking for. Buy out every captured coin on offer and this is the bill. |
| **Quoted Buy Gold Notional** | `Σ (buy amount × buy price)` — gold committed in buy offers. Tibia escrows the gold behind a buy offer, so this is quoted gold committed behind the captured buy offers. |

Unlike the spread these are sums over rows, so they cannot be rebuilt from the
best price and the volume once the rows are gone — which is why they are stored.

They run to billions; tables show the full, fully-grouped figure rather than
an abbreviated one, so nothing is ever rounded away on screen. The CSV carries
the same integer with no separators.

Both are optional fields: rows exported before they existed still import.

**Spread is not one of them.** It is exactly `Sell − Buy`, so it is computed when
a table or chart is drawn rather than written to the database — a stored copy
could only ever fall out of step with the two values it comes from.

A negative spread is shown in red. It means a crossed market was saved past the
warning with *Save anyway*, which almost always indicates a misread price.

Never stored, never uploaded, never committed:

- **the screenshot** — decoded into a canvas, read, then discarded; the only thing
  kept from it is the SHA-256 of its bytes
- **the character name** — parsed from the filename into a local variable, used for
  the TibiaData lookup, and out of scope when the function returns

This is enforced in code, not by convention. `js/store.js` defines an `ALLOWED`
list and `toRecord()` builds a fresh object from it. `js/offers.js` applies a
separate whitelist to each offer observation, so a caller cannot write a
character name or a filename into the database even by mistake.

`.gitignore` blocks image files, so a stray screenshot cannot be committed either.

## How a screenshot is processed

```
file ──► original Hotkey filename filter ──► SHA-256 duplicate check
     ──► original Market verification ──► Tibia Coins verification
     ──► Market view type ──► filename metadata ──► TibiaData world workflow
     ──► Offers: individual offers → existing validation → persistence
     ──► Details: 30-day Statistics → independent side validation → persistence
```

Screenshot ingestion is shared with the Python batch. The original filename filter runs first, followed by hash deduplication, Market verification, Tibia Coins verification, view identification, metadata parsing, world resolution, view-specific extraction and validation. World resolution completes before either view is extracted. Full filenames, including their embedded character names, are transient feedback local to the processing/review queue, including skipped and error states; they never enter storage or exports.

### Reading the market table

Nothing is hardcoded to a resolution. Pass 1 runs sparse-text OCR over the whole
image to find the `Sell Offers:` / `Buy Offers:` labels and the `Amount`,
`Piece Price` and `Total Price` headers. Every crop is then derived from those
positions, so any client size or UI scale works.

Pass 2 runs digit-only OCR over each table body. Because the numbers are
right-aligned, each token is matched to the nearest column edge.

The numeric crop stops at **Total Price** so date digits cannot contaminate the
checksum. A separate crop reads **Ends At** and aligns each date to its numeric
row by vertical position, retrying unread dates one row at a time. Dates must
include seconds and pass calendar validation; missing or invalid dates are
flagged for correction.

### The checksum

The three columns are redundant: `amount × price` must equal `total`. Every row
is checked, and a row that fails is flagged red and blocks saving until you fix
it (or click *Save anyway*). A single misread digit breaks the product, so this
catches OCR errors that would otherwise pass silently.

Other blocking checks: a crossed market (best Buy ≥ best Sell), and a first row
that is not the best price (the market is sorted, so that means a misread).

### Reading at low confidence, on purpose

The body pass accepts words Tesseract is barely confident about. That sounds
reckless and is the opposite: every row it produces is checked by
`amount × price == total`, so a shaky read is caught and shown for correction.

Being strict did the damage it looked like it was preventing. A faint first row
was discarded for low confidence — and a discarded row leaves no numbers to check
at all, so it vanished silently, taking the best price and part of the volume
with it. A misread row announces itself; a missing row does not.

The anchor pass that locates the columns keeps a high bar, because nothing
downstream verifies it.

### Rows that were missed entirely

A checksum can only vouch for a row that was read. A row OCR skipped leaves no
numbers to check, yet it still lowers the volume and can hide the best price.

Offer rows are evenly spaced, so one skipped in the middle of the list leaves a
gap of twice the normal pitch. That is measured between rows, like against like,
and is reliable enough to block a save.

A row missing from the *top* of the list leaves no such gap; it shows up as a
blank band under the column header. The bottom edge of that header is taken as
the **median** of its words' bounding boxes, not the lowest: Tesseract glues the
column divider `|` onto some header words, a pipe is taller than a letter, and
taking the lowest edge started the crop a few pixels inside the first offer row
and shaved it off — the row holding the best price. That one detail was behind
most of these warnings. That one blocks a save too, because the top
row is the one that matters — it holds the best price.

If only a single row is read, there is no spacing to judge anything by, and that
is called out rather than quietly accepted.

### Screenshots at other resolutions and UI scales

Tibia draws its interface with a fixed bitmap font, so glyphs are the same size
in pixels on any monitor — until something scales the picture. A client at 2×
UI scale, a HiDPI capture, or a screenshot someone resized before sending all
change the glyph height, and a fixed upscale factor then lands the text either
too small to read or so large it smears.

So the crop is scaled to bring glyphs to a constant height, measured from the
column header found in that particular image. If the section labels and headings
cannot be read at all, the whole image is re-read once at 2×, with the
coordinates mapped back — the retry continues until the *headings* are legible,
not merely the "Sell Offers:" label above them, which is larger and survives a
downscale the headings do not.

Measured on one screenshot rendered at several scales:

| Width | Result |
|---|---|
| 855 px | rejected, with a message saying the capture is too small |
| 1111 px | rejected |
| 1282 px | read in full |
| 1453 – 2565 px | read in full |
| 3420 px | reads, may flag one row for checking |

### Header rows that did not survive OCR

Both tables are drawn with identical column positions. If the `Amount /
Piece Price / Total Price` headers cannot be read for one table, that table
borrows the other's column geometry instead of failing. Only when neither
table's header can be found does the screenshot error out.

Every row is editable, so a partially cut-off offer can be corrected or removed
before saving — it is excluded from the volume sums.

### Reviewing the offers

Each side is laid out with the Tibia client's own column names — **Amount (TC)**,
**Piece Price (gp/TC)**, **Total Price (gp)** and **Ends At** — followed by the checksum result
and a button to drop the row. Every field is editable, so an offer that was
misread can be corrected, and one that is cut off at the edge of the screenshot
can be removed. Removed rows do not count towards the volume or the gold totals.

### Working through a batch

Drop a whole day's screenshots at once. Each becomes a single-line card showing
world, BattlEye, best prices, volumes and spread. A clean read stays folded; any
screenshot needing attention opens itself. The bar above the list counts what is
ready and what is not, and **Save all ready** stores every card that passes its
checks, leaving the rest for you to correct.

### BattlEye

Derived from the authoritative TibiaData fields, never guessed:

| TibiaData | Output |
|---|---|
| `battleye_protected: false` | Off |
| `battleye_date: "release"` | Green |
| `battleye_date: "<a date>"` | Yellow |

Comparing the date to the public rollout would be wrong: Luminera was created in
2005-07 but reports a BattlEye date of 2017-09-05.

## Numbers

Every value in this app is a Tibia Coin market figure, so the unit is implicit
in the app's single purpose: nothing in the interface prints `gp`, `TC` or
`gp/TC`, and a figure is never abbreviated with an SI prefix (`1.93 G`). A
quantity is shown exactly as it is — a plain, fully-grouped number:

```
4 084        39 600
```

Digit grouping uses the browser's own locale (`Intl.NumberFormat` with no
locale override), so a figure reads the way everything else on your system
already does. There is no separator to pick and nothing to remember — this is
presentation, not a setting.

A negative Spread means a crossed market (see below) and is shown as an
ordinary signed number in the semantic "bad" colour, paired with a tooltip —
never with an accounting convention like parentheses. A dash stands only for
a value that does not exist yet (an optional field on an older row) — a real zero is shown as `0`.

Column headers name each figure once (`Sell Price`, `Quoted Sell Gold Notional`, …); the
figure itself is never re-labelled or re-formatted to say so again.

### Where a unit does matter

`observations.json` and the CSV carry plain integers with no separators or
symbols at all, because they are read by machines. The snapshot CSV states each unit
in its column heading instead: `Sell (gp/TC)`, `Quoted Sell Gold Notional (gp)`.

## Presentation of the captures table

The Database table orders its groups **Sell side** / **Buy side** / **Derived** /
**Data**, after World. Sell price, volume and Quoted Sell Gold Notional stay together; Buy price,
volume and Quoted Buy Gold Notional stay together. Spread sits under Derived. Type, BattlEye,
Capture, Hash and removal sit under Data. Existing column visibility preferences
remain in effect. Quoted Sell Gold Notional and Quoted Buy Gold Notional remain gross, never offset against
one another. Column tooltips explain the measures and calculations.

Saved 30-day Statistics use the same compact table styling, with exactly one row
per snapshot: World, four Sell metrics, four Buy metrics, then Capture, Hash and
removal under Data. Each side has **Tx / High / Avg / Low**; tooltips expand
these to raw transaction counters and the three prices. The capture
keeps its local fractional seconds; its tooltip retains the timezone and resolved
UTC timestamp. This presentation does not change records or exported data.

## Dates and times

Capture timestamps follow **ISO 8601** extended format:

```
2026-09-21T12:43:17
```

Year first, zero-padded, `T` between date and time. There is no ambiguity about
which field is the day and which is the month — `09/21` and `21/09` both read as
21 September here. As a bonus, ISO 8601 strings sort chronologically as plain
text, which is how the database orders rows without parsing anything.

## Deploying

The site is static — every file is served as-is, with no build step.

Settings → Pages → Source: *Deploy from a branch* → `main` / `root`.

## Keeping the data

Rows live in IndexedDB on the device that scanned them. To publish a shared
dataset:

1. **Export JSON** (Manage)
2. Commit the file as `data/observations.json`

Every visitor then loads that baseline on boot and merges it with their own local
rows. **Import** merges a JSON file back in. Duplicate hashes are skipped when their offer extraction is already current.
An imported enriched capture can add offer history to a local snapshot with the
same hash. Re-importing is safe, and the original capture context is preserved.

## Individual offer history and historical backfill

Every identified offer receives a random persistent UUID. Matching uses
`World + Side + Piece Price + Ends At`; the remaining amount is observation
state and can change without changing the UUID. Offers are nested in their
capture's JSON record and linked across captures by `offerId`. The capture hash,
world and original capture timestamp supply the observation context.

Two identical rows in one capture receive different UUIDs. Later matching in a
collision group is one-to-one and marked `matchAmbiguous: true`: quantities and
row order may help choose an assignment, but screenshots do not prove which
colliding offer is which. Exported offer observations mark all observations of
known collision groups as ambiguous. No disappearance is classified as filled,
cancelled or expired.

To backfill screenshots already saved in this browser:

1. Export JSON as a backup.
2. Enable **Reprocess saved**, then drop the original files again.
3. Review the individual offers and correct any unread **Ends At** values.
4. Save. The existing capture gains offer observations; its original world,
   capture date remain intact. Canonical ingestion recomputes snapshot totals from
   the validated visible offers. Current character-world
   lookups are skipped for existing captures, including transferred characters.

The mode defaults to off. Accidental duplicate files and identical files within
one batch remain blocked. Reprocessing the same capture repeatedly keeps its
UUIDs and does not append duplicate observations. Reprocessing that omits
previously tracked rows or loses their expiration timestamps is rejected without
changing stored data. Historical captures may be processed in any order.

**Export JSON** includes complete captures and offer history and can be imported
again. **Export CSV** retains the existing snapshot format. **Export Offers**
produces `offer-observations.csv` for worlds matching the World filter, with UUID,
world, side, capture timestamp, hash, row position, amount, price, total,
expiration, ambiguity and processing version. Prices and totals are in gold;
amounts are Tibia Coins. The export includes all captures for the matching worlds,
independent of the table's date-range selection.

Offer expiration timestamps preserve the client's displayed local clock and resolve `endsAtUtc` using the same browser/system IANA timezone as the filename capture clock. Legacy records retain their existing context.
The processing version is independent of screenshot identity. An older snapshot
has version 0 implicitly; version 1 supports individual offer tracking. A missing
expiration can be saved using **Save Anyway** for a new capture, but that row has
`offerId: null` until reprocessed with a valid date. No timestamp is fabricated.
Deleting a capture deletes its nested observations; clearing the database deletes
all local offer history. Other captures retain their UUIDs.

The browser and optional CLI are independent local datasets. Their exports use
matching offer-observation fields; UUID allocation is local to each dataset.
CLI offer history can be exported for research, while its existing snapshot
schema and original audit context remain unchanged.

## Verification

No production build or new runtime dependency is required.

```bash
node --test tests/*.test.mjs
python3 -m unittest discover -s tools -p 'test_*.py' -v
python3 -m http.server 8765 --bind 127.0.0.1
# In another terminal, with Playwright available:
node tests/browser.mjs
node tests/markets-browser.mjs
node tests/market-events-browser.mjs
node tests/market-projections-browser.mjs
node tests/trade-browser.mjs
node tests/site-header-browser.mjs
```

The browser suite checks real IndexedDB, privacy whitelists, world isolation,
collisions, repeated enrichment, import/export, concurrent allocation and
responsive controls. Set `TIBINANCE_NODE_MODULES` to a bundled node_modules path
and `TIBINANCE_CHROME` to a Chrome executable when needed. Set
`TIBINANCE_SAMPLE` to an original market sample image to also verify real OCR,
file upload, duplicate rejection and reprocessing. The test uses an isolated
browser profile and substitutes only the world API responses. OCR requires the
same CDN access as the application.

## Filename format

```
2026-09-21_124317718_Character Name_Hotkey.jpeg
└── date ──┘└─ time ┘└── character ──┘└ ignored ┘
                 ↑ trailing digits = fractional seconds, preserved
```

Character names may contain spaces but not underscores.

## Files

```
index.html               UI shell
css/app.css               styles
js/app.js                 orchestration, the review UI's review UI, export/import
js/format.js                shared number/text presentation (no settings)
js/ocr.js                 layout-aware market reader
js/tibiadata.js            API client, caching, BattlEye derivation
js/store.js                IndexedDB (captures) + the privacy whitelist
js/offers.js               world-specific UUID matching and offer observations
js/filename.js              filename parsing
js/hash.js                  SHA-256
data/observations.json    committed baseline (starts empty)
markets.html              Markets page shell
css/markets.css           Markets layout
js/markets.js             Markets chart, watchlist and address state
js/market-series.js       chart layers, ranges and changes (no DOM)
js/market-history.js      TibiaMarket and capture conversion to the history format
js/market-chart.js        the Markets chart and its layers, for the page and the export
js/market-events.js       events: applicability, lifecycle span, grouping, validation (no DOM)
js/market-events-layer.js the Events chart layer: markers drawn by a pane primitive
js/market-events-ui.js    inspecting the markers by pointer, touch and keyboard
js/market-projections.js  projections: placement, boundary, weeks and wording (no DOM)
js/market-projections-layer.js  the Projections chart layer: central path, band, boundary
trade.html                Trade page shell
css/trade.css             Trade layout
js/trade.js               Trade fields and comparison text
js/trade-strategies.js    trade now or create an offer: fee, strategies, break-even (no DOM)
tools/build_market_history.mjs  generates data/market-history/
tools/build_market_events.mjs   generates data/market-events/events.json
tools/build_market_projections.mjs  copies the Research scenarios to data/market-projections/
tools/fetch_market_history.mjs  freezes extra inputs in data/market-history/inputs/
data/market-history/      generated Markets dataset and its frozen inputs
data/market-events/       generated event dataset and its curated inputs
data/market-projections/  the Research's offer scenarios, carried over for Markets
tools/tcmarket.py         optional CLI for the same pipeline (see tools/README.cli.md)
reports/tc-cycle/         Tibia Coins cycle report: static page + Python analysis
```

`tools/` is independent of the site: a Python CLI that runs the identical
pipeline from a terminal and stores rows in SQLite. Useful for bulk back-fills.

Tesseract.js is loaded from a CDN. Not affiliated with CipSoft, tibiamarket.top
or the TibiaMarket API's author.

For offline macOS archives, the [batch OCR guide](tools/README.cli.md#offline-archive-ocr-on-macos)
describes Tesseract → Apple Vision → manual review, preserving every failed or
partial extraction in a screenshot/row/field report. This optional native tool
uses your existing JSON export for historical world context and produces a
separate importable enriched dataset.

The browser and offline reader require **Tibia Coins in the highlighted Items
row** before accepting coin offers. Other selected items are explicitly excluded;
an unread selection requires review. Search text and unselected items do not
qualify.

## 30-day Statistics capture schema (processing version 6)

The Market has two separate supported views: `viewType: "offers"` retains the
existing live order-book fields and offer observations; `viewType: "statistics"`
contains the eight historical Details values plus the raw Statistics counters, with
no fabricated live quotes or offer rows. Records without `viewType` are legacy
Offers captures. Both types share the existing world/API flow, hash deduplication,
privacy boundary and storage. Details screenshots do not need offer-table headers.

A Statistics capture uses this additive schema (world/Type/BattlEye resolved through
the existing API flow; the numbers below illustrate the reference layout):

```json
{
  "world": "Antica",
  "type": "Open PvP",
  "battleye": "Yellow",
  "hash": "<SHA-256>",
  "viewType": "statistics",
  "processingVersion": 6,
  "capturedAt": "2026-10-02T00:36:37.332",
  "captureDate": "2026-10-02",
  "captureTimeZone": "America/Sao_Paulo",
  "capturedAtUtc": "2026-10-02T03:36:37.332Z",
  "statisticsReferenceDate": "2026-10-01",
  "statistics30d": {
    "buy": {
      "transactions": 3396,
      "highestPrice": 49985,
      "averagePrice": 44155,
      "lowestPrice": 1
    },
    "sell": {
      "transactions": 6082,
      "highestPrice": 49998,
      "averagePrice": 45942,
      "lowestPrice": 44000
    }
  }
}
```

`capturedAt` remains the original local filename datetime, including fractional
seconds, for compatibility. `capturedAtUtc` is the resolved instant used for
conversion and chronological Statistics comparisons. The website automatically detects the
browser's IANA timezone; the Python bridge detects its system IANA timezone.
There are no manual timezone controls.
Reprocessing preserves a saved capture's world, local clock and known timezone.
Unavailable timezones, nonexistent DST clocks and repeated DST clocks remain
unresolved (`capturedAtUtc` and `statisticsReferenceDate` are null), without inventing an
instant. The original local clock and timezone are retained for review.

The Statistics values describe the displayed trailing 30-day Market summary **at
that capture instant**. No current, processing, import or rebuild date changes the
anchor. No exact window endpoints or assumption of 30 server-save intervals are
stored. Only Statistics snapshots have `statisticsReferenceDate`: find the
**10:00 Europe/Berlin (CET/CEST)** server save that falls on the capture's local
calendar date. Before that local boundary, use the previous local calendar date;
at or after it, use the current local date. This reference anchors the 30-day
historical/regression analysis; it never replaces the actual observation instant.
For `2026-10-02T04:50:00 America/Sao_Paulo`, the local save is 05:00, so the
reference is `2026-10-01`. At 05:00 it becomes `2026-10-02`. IANA rules handle
CET/CEST and local DST, including local dates different from Berlin dates.

Normal Offers snapshots have no Statistics reference date. Their `endsAt` values
retain the client-displayed local clock and additive `endsAtUtc` resolves each
expiry with the same IANA timezone as the capture, using the expiry's own date
and DST rules. An ambiguous or nonexistent local expiry retains its displayed
clock with null UTC; it is never interpreted as CET/CEST. Existing offer UUID
matching remains compatible with legacy displayed-clock identities.

`transactions` preserves the raw Number of Transactions exactly as displayed.
No conversion to TC quantity is established. Legacy `tcVolume` fields are ignored on import and omitted from normalized exports.
The three prices remain gold per TC and are never multiplied by 25. Both sides
validate independently: complete nonnegative safe integers, positive ordered
prices when transactions exist (`lowest ≤ average ≤ highest`), explicit zero
summary for zero transactions. Historical side
averages may cross; live-book spread checks do not apply to Statistics. Missing,
unreadable, incomplete, low-confidence or conflicting OCR fields require review.
All eight fields are editable before saving; saving cannot override validation.
The image reader uses the already verified Statistics pane even when the cropped
heading is misread by WebKit. Side/field labels, numeric confidence and agreement
between OCR passes remain required. Missing OCR values stay blank and produce
extraction-specific review feedback before value validation. No traded TC quantity is derived from these counters.

JSON and snapshot CSV include both capture types, all eight directly observed Statistics fields. Offer-observation exports continue to contain only actual offers.
Nested Statistics values are explicitly whitelisted; filenames, characters,
paths, raw OCR and image data remain transient. Old exports without Statistics
still import and retain their existing report behavior.

The English and Portuguese research pages accept mixed `market-update.json`
exports. Existing live-offer charts/models continue to use Offers captures.
The separate Statistics exhibit provides compact world, date and metric selectors,
historical charts and a source table. History defaults to Statistics reference dates;
local capture dates remain an optional observation view. It shows the transaction counts,
each price, high/low range, average-price changes and a best-quote
comparison when an earlier resolved quote is available. Rolling windows overlap:
counts are never summed across captures or differenced into daily flows.
The latest snapshot per world/side/date bucket is selected without interpolating
missing observations. Legacy unresolved captures remain in the local view and
are excluded only when a Statistics reference-date view needs a resolved instant.

Additional checks:

```bash
node --test tests/statistics.test.mjs
python3 -m unittest discover -s tools -p 'test_statistics.py' -v
python3 -m unittest discover -s reports/tc-cycle -p 'test_statistics_schema.py' -v
# Against the local static server, with optional real screenshot paths in env:
node tests/statistics-browser.mjs
node tests/tables-browser.mjs
```

`TIBINANCE_STATISTICS_SAMPLE` enables real Details OCR/interaction checks;
`TIBINANCE_OFFERS_SAMPLE` enables the paired real Offers regression. These checks
use isolated browser storage and API fixtures. No test state is imported into
canonical data. The historical rebuild and subsequent Apple Vision review are
complete: its 390 accepted captures are preserved; the latest screenshot update has 467 accepted captures across 40 worlds, with no unresolved review cases.
The anonymous [review audit](data/rebuild-vision-review.json) records recoveries and
per-world coverage; [validation](data/rebuild-validation.json) reconciles the archive.
The progress ledger is in `PROGRESS.md`.


### October 3 screenshot update and independent review

The current canonical data contains 467 captures (427 Offers and 40 Statistics),
7,419 offer observations and 5,433 offer identities across 40 worlds. The update
adds 77 captures and preserves every previously accepted capture, timestamp,
world and offer identity. The complete local archive reconciles to 503 unique
eligible images plus 40 duplicate copies: 467 ready, 28 no-Market, three other
items and five historical manual exclusions. No review/runtime failures remain.

Before changing extraction, eleven marked originals were independently inspected
and transcribed from their pixels. The anonymous [field review](data/market-update-review.json)
records the visible values, pre-fix extraction, 572 matching fields, 49 differences
(including a spurious row), and each failure's cause. No field remained visually
ambiguous. Filename mappings and full Market-window privacy previews stay in the
ignored local review directory. Neither image-specific corrections nor filename,
hash or fixed-coordinate extraction rules were used.

Offers now use header-derived columns and physical text bands before reading
individual rows. Separate resampling passes, strict integer parsing, amount ×
price checks and conflicting-read confirmation prevent merged or silently
shifted rows. Expiry crops follow the visible text extent and require two agreeing
complete timestamps; normalization removes only inserted horizontal whitespace.
Statistics title recovery stays within the verified pane, and neighbouring field
labels determine glyph size rather than an inflated title box. Incomplete or
conflicting readings remain review cases.

Anonymous world/time context is checkpointed after canonical world resolution
and before value extraction. Worker cleanup releases the queue on success or
failure. Each screenshot gets a fresh OCR worker, bitmap, geometry and result;
queued readers wait for worker disposal. No cross-image contamination was found.
The earlier batch limitation was a Chrome process lifetime issue: on this machine,
automated Chrome also exits after about 32 seconds with a blank page and no OCR.
Fresh pages and contexts do not prevent it. `--isolate-browser` remains an operational
workaround, and runtime failures require review/retry. The native shutdown cause
remains unresolved; see the [batch isolation investigation](docs/ocr-batch-isolation.md).

[Archive validation](data/market-update-validation.json),
[rejections](data/market-update-rejections.json) and
[chronological processing](data/market-update-processing-order.json) are anonymous.
The Markets history was regenerated from the installed captures and existing frozen inputs; its conversion retains 465 usable capture observations under the unchanged spread policy. All 79 JavaScript tests pass, including deterministic history reproduction and canonical quote preservation.

Real-image regressions locate ignored originals by SHA; hashes select fixtures,
never production algorithm behaviour:

```sh
TIBINANCE_SCREENSHOT_DIR=screenshots TIBINANCE_BROWSER=webkit node tests/ocr-review-browser.mjs
TIBINANCE_SCREENSHOT_DIR=screenshots TIBINANCE_ISOLATE_BROWSER=1 node tests/ocr-review-browser.mjs
TIBINANCE_SCREENSHOT_DIR=screenshots TIBINANCE_BROWSER=webkit TIBINANCE_OCR_FIXTURES=tests/fixtures/ocr-controls.json node tests/ocr-review-browser.mjs
```

Set `TIBINANCE_NODE_MODULES` when Playwright comes from an external runtime.
The control fixtures cover previously validated historical Offers and Statistics;
the review fixtures contain independently transcribed ground truth.

### Market metric semantics and compatibility

Statistics counters measure raw transaction activity, with daily and last-30-day windows kept separate. Actual traded TC quantity and executed gold turnover are unknown. Legacy `tcVolume` fields are ignored during import; new normalized records, CSVs and generated history omit them. No replacement quantity is estimated.

`buyVolume` and `sellVolume` retain their compatible field keys and actual TC values, but are displayed as Captured Buy/Sell Depth. Best-price quantities include only captured rows at that price. `goldSupply` and `goldDemand` are Quoted Buy/Sell Gold Notional over captured rows, not turnover or total world gold. Complete order-book coverage is not established.

The upstream board API exposes legitimate returned-offer TC quantities and could support a separate future depth feature. Its coverage requires validation; it is not imported into production by this correction. Frozen historical source inputs and older counter-analysis field names remain intact; their activity values are not traded TC volume.
