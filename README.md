# Tibinance

**Tibia Coins market tracker.**
A static site for GitHub Pages. Drag in your daily Tibia market screenshots; the
browser hashes them, reads the Sell/Buy tables, resolves the world through
TibiaData, and stores **only anonymous market data**. Existing worlds also get
their price history backfilled from TibiaMarket, so a new screenshot continues
a timeline instead of starting one.

No backend, no build step, no API key, no cost.

## Two views

**Market** is the analysis view: every world is a time series, not a table of
repeated rows. Pick one or several worlds and Sell/Buy price, Spread, the two
volumes and the two gold sums are charted over time, with 7D/30D/90D/1Y/All
presets or any custom date range. A **Latest** table above the charts compares
the worlds currently selected, statistically flagging whichever is out of line
with the rest — see [Finding an outlier](#finding-an-outlier-not-the-biggest-number).

**Manage** is where the dataset is built: drop screenshots, review and correct
what OCR read before saving, see every individual capture (including several
from the same world), and import, export or delete data. This is also where
the privacy boundary lives — see below.

A world only ever reaches the Market view by first being saved from a
screenshot in Manage. See [Legacy history from TibiaMarket](#legacy-history-from-tibiamarket).

## What is stored, and what is not

Stored — exactly these eleven fields, nothing else:

`World · Type · BattlEye · Sell · Sell Volume · Gold Demand · Buy · Buy Volume ·
Gold Supply · Capture Date · Screenshot Hash`

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
list and `toRecord()` builds a fresh object from it, so a caller cannot write a
character name or a filename into the database even by mistake. TibiaMarket's
legacy history carries no screenshot or character data at all — it is public
market history keyed only by world and time — so it lives in its own
IndexedDB store and never touches that boundary.

`.gitignore` blocks image files, so a stray screenshot cannot be committed either.

## How a screenshot is processed (Manage)

```
file ──► SHA-256 ──► duplicate? ──► stop
     ──► filename ──► character name ──┐
     ──► canvas ──► OCR ──► rows       │
                                       ▼
        TibiaData /character ──► world ──► /worlds ──► type + BattlEye
                                       │
     rows ──► best prices + volumes ───┴──► review ──► save
```

The OCR and the API calls run concurrently.

### Reading the market table

Nothing is hardcoded to a resolution. Pass 1 runs sparse-text OCR over the whole
image to find the `Sell Offers:` / `Buy Offers:` labels and the `Amount`,
`Piece Price` and `Total Price` headers. Every crop is then derived from those
positions, so any client size or UI scale works.

Pass 2 runs digit-only OCR over each table body. Because the numbers are
right-aligned, each token is matched to the nearest column edge.

The crop deliberately stops at the **Total Price** column rather than at the
`Ends At` header: the date begins only a few pixels to the right, and letting it
in glues `202` (from `2026-…`) onto the totals.

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
**Piece Price (gp/TC)**, **Total Price (gp)** — followed by the checksum result
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

## The Market view

### Every world is a series, not a row

Manage stores one row per screenshot. Market never shows that table directly —
it groups every row for a world into one time series, merges in that world's
TibiaMarket history if any was fetched, and sorts the result by capture time.
Each point keeps its own **source** (`screenshot` or `legacy`), so a chart can
show real gaps rather than interpolating across the ones this project has no
data for — a metric only TibiaMarket-style aggregate stats give (like volume)
simply has no line where only legacy points exist.

### Ranges

**7D / 30D / 90D / 1Y / All** are quick presets against "now". A custom range
is set with the two date/time fields next to them, which take over from the
presets the moment both are filled in.

### Finding an outlier, not "the biggest number"

The cheapest world is always the cheapest. That tells you nothing about whether
it is cheap *enough to act on*. So the **Latest** table above the charts flags a
world by how far its latest figure sits from the other selected worlds, using a
**modified z-score** — the distance from the median, in units of the median
absolute deviation.

Mean and standard deviation would be the wrong tools. With a handful of worlds,
one of which is the outlier being hunted, the mean is dragged toward it and the
deviation inflated, so the outlier partly conceals itself and ordinary worlds
look stranger than they are. The median and MAD do not move when a few values
are extreme, which is the whole point when the extremes are what you want.

Past 2 MAD a cell is marked; past 3.5 — the conventional outlier line — it is
marked strongly. Hover for the score and the median it is measured against.
At least three selected worlds are needed before any of this means anything.

A world whose latest observation falls outside the range currently shown is
still listed (so it does not simply disappear when you narrow the range) but
dimmed, with a tooltip saying so.

## Legacy history from TibiaMarket

[tibiamarket.top](https://tibiamarket.top) collected Tibia Coin prices
automatically from the Tibia client until CipSoft banned that collection
method; Tibinance exists to keep that analysis experience going through
user-supplied screenshots instead. The history TibiaMarket already gathered,
though, is still worth having — its API (`api.tibiamarket.top`, documented at
`/docs`) keeps serving it, with an open CORS policy, so it is read straight
from the browser exactly like TibiaData.

**Scoping is strict, and one-directional.** A world enters Tibinance only by
being saved from a screenshot in Manage. Only once it exists in the local
database does Tibinance fetch that world's Tibia Coin history from TibiaMarket,
to extend its timeline backwards. TibiaMarket's own world list is never
consulted to decide which worlds to show — a world with rich TibiaMarket
history that you have never screenshotted stays entirely out of Tibinance.
Add a screenshot from a new world and *that* world becomes eligible on the
next fetch.

The fetch itself runs quietly in the background (Market shows a one-line
status while it is in progress) and only once per world — a per-world flag in
IndexedDB (`legacyMeta`) remembers whether it already succeeded, so it is not
re-fetched on every visit. The API allows one request every 5 seconds, so
backfilling several worlds at once takes a few seconds per world; a failed
fetch (network trouble, an unrecognised world name) is simply retried the next
time the data changes, not looped on the spot.

Legacy points carry only what TibiaMarket exposes — the best Sell and Buy
price at that time — mapped directly onto this project's own `sell`/`buy`
fields (TibiaMarket uses the same convention: the lowest sell offer, the
highest buy offer). It has no analogue for the OCR-derived volumes or gold
sums, so those stay unset on a legacy point rather than being approximated
from TibiaMarket's own (differently defined) monthly turnover figures — hence
the gaps described above.

Legacy history is cached locally but is not part of Export/Import: it is
derived, re-fetchable data scoped to whatever worlds exist locally, not part
of the dataset you built. Only the `observations` store (your screenshots)
round-trips through Export/Import/the committed baseline.

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
a value that does not exist yet (an optional field on an older row, or a
legacy point TibiaMarket has no analogue for) — a real zero is shown as `0`.

Column headers name each figure once (`Sell Price`, `Gold Demand`, …); the
figure itself is never re-labelled or re-formatted to say so again.

### Where a unit does matter

`observations.json` and the CSV carry plain integers with no separators or
symbols at all, because they are read by machines. The CSV states each unit
in its column heading instead: `Sell (gp/TC)`, `Gold Demand (gp)`.

## Presentation of the captures table

Manage's captures table groups its columns **Sell side** / **Buy side**, with
the derived measures — **Spread**, **Gold Demand**, **Gold Supply** — held
apart under **Derived**, gross and never offset against one another: a single
net figure would hide how thin or deep either side of the market is. Every
column is labelled for exactly what it holds, and what a derived measure
means and how it is computed is one hover away, on that column's own header.

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
rows. **Import** merges a JSON file back in. Duplicate hashes are skipped
throughout, so re-importing is safe. TibiaMarket legacy history is not part of
this file — see [Legacy history from TibiaMarket](#legacy-history-from-tibiamarket).

## Filename format

```
2026-09-21_124317718_Royal Flyn_Hotkey.jpeg
└── date ──┘└─ time ┘└── character ──┘└ ignored ┘
                 ↑ trailing digits = fractions of a second, dropped
```

Character names may contain spaces but not underscores.

## Files

```
index.html               UI shell for both views
css/app.css               styles
js/app.js                 router, orchestration, Manage's review UI, export/import
js/market.js               Market view: per-world series, ranges, charts, snapshot
js/tibiamarket.js          TibiaMarket API client (legacy history, rate-limited)
js/format.js                shared number/text presentation (no settings)
js/ocr.js                 layout-aware market reader
js/tibiadata.js            API client, caching, BattlEye derivation
js/store.js                IndexedDB (screenshots + legacy history) + the privacy whitelist
js/filename.js              filename parsing
js/hash.js                  SHA-256
data/observations.json    committed baseline (starts empty)
tools/tcmarket.py         optional CLI for the same pipeline (see tools/README.cli.md)
```

`tools/` is independent of the site: a Python CLI that runs the identical
pipeline from a terminal and stores rows in SQLite. Useful for bulk back-fills.

Tesseract.js is loaded from a CDN. Not affiliated with CipSoft, tibiamarket.top
or the TibiaMarket API's author.
