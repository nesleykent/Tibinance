# Tibinance

**Tibia Coins market tracker.**
A static site for GitHub Pages. Drag in your daily Tibia market screenshots; the
browser hashes them, reads the Sell/Buy tables, resolves the world through
TibiaData, and stores **only anonymous market data**. It also accepts Tibia Coins Details / Statistics screenshots as a separate capture type. Existing worlds also get
their price history backfilled from TibiaMarket, so a new screenshot continues
a timeline instead of starting one.

No backend, no build step, no API key, no cost.

## Research

[**Tibia Coins: Price Dynamics, Predictability and Execution**](https://nesleykent.github.io/Tibinance/reports/tc-cycle/) is an interactive research report covering every world in its Market capture export. It follows one inferential chain, from data construction and the empirical structure of the Market through cycles, competing models and out-of-sample validation to prospective scenarios, execution frictions, differences across worlds and robustness checks, and it treats Sell Offers and Buy Offers separately throughout. It is published in two editions built from the same data: [English](https://nesleykent.github.io/Tibinance/reports/tc-cycle/) and [Brazilian Portuguese](https://nesleykent.github.io/Tibinance/reports/tc-cycle/pt-br.html), the latter keeping every financial, statistical, Tibia and game term in English.

The analysis uses [TibiaMarket’s public API](https://api.tibiamarket.top/docs) and the supplied Market captures; the page reads every count and date from its data files. Daily averages are compared separately and never substituted for Sell Offers, Buy Offers or verified transaction prices. Forecast ranges and simulated probabilities are conditional on the model and the historical sample, with backtest limits stated in the report. [Read the methodology, source data and reproduction guide](reports/tc-cycle/README.md).

## Building the dataset

Drop screenshots, review and correct what OCR read before saving, see every
individual capture (including several from the same world), and import, export
or delete data. Analysis lives in the [research report](#research). This is
also where the privacy boundary lives; see below.

## What is stored, and what is not

Stored snapshot fields:

`World · Type · BattlEye · Sell · Sell Volume · Gold Demand · Buy · Buy Volume ·
Gold Supply · Amounts at best prices · Capture Date · Screenshot Hash`

Each capture also stores its processing version and visible offer observations:
`Side · Row Position · Amount · Piece Price · Total Price · Ends At · Offer UUID ·
Matching Ambiguity`. No character or offer-owner names enter these observations.

### Gold supply and demand

Two aggregates over every visible offer, not just the best one:

| | |
|---|---|
| **Gold Demand** | `Σ (sell amount × sell price)` — the gold sellers are asking for. Buy out every coin on offer and this is the bill. |
| **Gold Supply** | `Σ (buy amount × buy price)` — gold committed in buy offers. Tibia escrows the gold behind a buy offer, so this is real gold standing ready on that world. |

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

Column headers name each figure once (`Sell Price`, `Gold Demand`, …); the
figure itself is never re-labelled or re-formatted to say so again.

### Where a unit does matter

`observations.json` and the CSV carry plain integers with no separators or
symbols at all, because they are read by machines. The snapshot CSV states each unit
in its column heading instead: `Sell (gp/TC)`, `Gold Demand (gp)`.

## Presentation of the captures table

The Database table orders its groups **Sell side** / **Buy side** / **Derived** /
**Data**, after World. Sell price, volume and Gold Demand stay together; Buy price,
volume and Gold Supply stay together. Spread sits under Derived. Type, BattlEye,
Capture, Hash and removal sit under Data. Existing column visibility preferences
remain in effect. Gold Demand and Gold Supply remain gross, never offset against
one another. Column tooltips explain the measures and calculations.

Saved 30-day Statistics use the same compact table styling, with exactly one row
per snapshot: World, five Sell metrics, five Buy metrics, then Capture, Hash and
removal under Data. Each side has **Tx / Volume / High / Avg / Low**; tooltips expand
these to transactions (25-TC lots), TC volume and the three prices. The capture
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
2. Enable **Reprocess saved screenshots**, then drop the original files again.
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
contains the eight historical Details values plus the derived TC volumes, with
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
      "lowestPrice": 1,
      "tcVolume": 84900
    },
    "sell": {
      "transactions": 6082,
      "highestPrice": 49998,
      "averagePrice": 45942,
      "lowestPrice": 44000,
      "tcVolume": 152050
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

`transactions` preserves the Number of Transactions exactly as displayed: for
Tibia Coins, it counts **25-TC lots**. Each side's `tcVolume = transactions × 25`.
The three prices remain gold per TC and are never multiplied by 25. Both sides
validate independently: complete nonnegative safe integers, positive ordered
prices when transactions exist (`lowest ≤ average ≤ highest`), explicit zero
summary for zero transactions, and safe consistent lot volume. Historical side
averages may cross; live-book spread checks do not apply to Statistics. Missing,
unreadable, incomplete, low-confidence or conflicting OCR fields require review.
All eight fields are editable before saving; saving cannot override validation.
The image reader uses the already verified Statistics pane even when the cropped
heading is misread by WebKit. Side/field labels, numeric confidence and agreement
between OCR passes remain required. Missing OCR values stay blank and produce
extraction-specific review feedback before value validation. TC Volume is shown
only after a valid transaction count is available.

JSON and snapshot CSV include both capture types, all Statistics fields and both
lot volumes. Offer-observation exports continue to contain only actual offers.
Nested Statistics values are explicitly whitelisted; filenames, characters,
paths, raw OCR and image data remain transient. Old exports without Statistics
still import and retain their existing report behavior.

The English and Portuguese research pages accept mixed `market-update.json`
exports. Existing live-offer charts/models continue to use Offers captures.
The separate Statistics exhibit provides compact world, date and metric selectors,
historical charts and a source table. History defaults to Statistics reference dates;
local capture dates remain an optional observation view. It shows the transaction counts,
TC volumes, each price, high/low range, average-price changes and a best-quote
comparison when an earlier resolved quote is available. Rolling windows overlap:
counts/volumes are never summed across captures or differenced into daily flows.
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
complete: 390 accepted captures across 40 worlds, with no unresolved review cases.
The anonymous [review audit](data/rebuild-vision-review.json) records recoveries and
per-world coverage; [validation](data/rebuild-validation.json) reconciles the archive.
The progress ledger is in `PROGRESS.md`.
