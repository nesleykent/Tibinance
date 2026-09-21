# Tibinance

**Tibia Coins market tracker.** 
A static site for GitHub Pages. Drag in your daily Tibia market screenshots; the
browser hashes them, reads the Sell/Buy tables, resolves the world through
TibiaData, and stores **only anonymous market data**.

No backend, no build step, no API key, no cost.

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

They run to billions, so the table shows them with SI prefixes (`10 G`,
`1.93 G`) and keeps the exact figure in the cell's tooltip. The CSV carries the
full integer.

Both are optional fields: rows exported before they existed still import.

**Spread is not one of them.** It is exactly `Sell − Buy`, so it is computed when
the table is drawn rather than written to the database — a stored copy could only
ever fall out of step with the two values it comes from. It appears in the table
and in the CSV export; `observations.json` stays canonical at the nine fields
above, so it round-trips through Import unchanged.

A negative spread is shown in red. It means a crossed market was saved past the
warning with *Save anyway*, which almost always indicates a misread price.

Never stored, never uploaded, never committed:

- **the screenshot** — decoded into a canvas, read, then discarded; the only thing
  kept from it is the SHA-256 of its bytes
- **the character name** — parsed from the filename into a local variable, used for
  the TibiaData lookup, and out of scope when the function returns

This is enforced in code, not by convention. `js/store.js` defines an `ALLOWED`
list and `toRecord()` builds a fresh object from it, so a caller cannot write a
character name or a filename into the database even by mistake.

`.gitignore` blocks image files, so a stray screenshot cannot be committed either.

## How a screenshot is processed

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
blank band under the column header. That one blocks a save too, because the top
row is the one that matters — it holds the best price.

If only a single row is read, there is no spacing to judge anything by, and that
is called out rather than quietly accepted.

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

## Comparing worlds

The database table is the comparison view.

- **Click any column heading** to sort by it; click again to reverse.
- **highlight best** marks the standout value in each column *among the rows
  currently on screen* — cheapest Sell, highest Buy, tightest spread, deepest
  book, most gold. Filter first and the highlight re-answers for that subset.
- **filter world** narrows to matching worlds.
- **latest per world** keeps only the newest observation per world, which is
  usually what you want when comparing a day's captures.

## Numbers

Quantities follow **ISO 80000-1 (SI)**.

### Digit grouping — where the two standards disagree

This is the one point where the conventions in use here genuinely contradict
each other:

| | |
|---|---|
| **ISO 80000-1 (SI)** | groups of three separated by a thin space. A comma or a point *shall not* be used, because the two swap meaning between locales — `48,784` is forty-eight thousand in one country and `48.784` in another. |
| **Financial reporting** | the comma (or the point, by locale) *is* the thousands separator, and a statement of figures is expected to show it. IFRS 18 does not prescribe a character. |

No single rendering satisfies both, so it is a setting — the **digits** control
above the table:

```
48,784      accounting (default)
48 784      ISO 80000-1
```

The choice is remembered per browser. Everything else stays SI whichever you
pick: prefixes bound to their unit, one narrow no-break space between a value
and its symbol, ISO 8601 timestamps.

### Units and prefixes

A unit follows its value, separated by one narrow no-break space:

```
4 084 gp/TC        39 600 TC
```

Gold sums reach billions, so they take an SI prefix. **A prefix is bound to the
unit symbol with no space between them** — the two form a single inseparable
symbol:

```
1.93 Ggp        89.3 Mgp        10 Ggp
```

Not `1.93 G gp`, and never a bare `1.93 G`: a prefix on its own is not a
quantity. Hover any of these for the exact figure.

Prefix symbols are case-sensitive — `k` for 10³, `M` for 10⁶, `G` for 10⁹ — and
are never compounded.

## Presentation — IFRS 18

The table follows **IFRS 18 *Presentation and Disclosure in Financial
Statements***, which supersedes IAS 1 for periods beginning on or after
1 January 2027 and may be applied early.

| IFRS 18 asks for | Here |
|---|---|
| Presentation currency, level of rounding, period covered | Stated above the table, and the period covers the comparatives as well as the current figures |
| Items presented in defined categories | Columns are grouped **Sell side** / **Buy side**, with the derived subtotal held apart under **Derived** |
| No offsetting of separate items | Gold demand and gold supply are shown gross. A single net figure would hide how thin or deep either side is |
| Meaningful labels, nothing dumped in "other" | Every column names exactly what it holds; there is no residual category |
| Measures not defined by a standard disclosed and reconciled | *Basis of preparation* names Spread, Gold Demand and Gold Supply as this project's own measures and gives the formula behind each |
| Comparative information for the preceding period | **comparatives** shows the capture immediately before each row, per world |

Open **Basis of preparation** above the table for the full note.

### Accounting presentation

Within that structure the figures are set the way a ledger is:

| | |
|---|---|
| Symbol placement | the unit sits at the left edge of the cell, digits at the right, so a column reads as one block |
| Negative values | in parentheses — `(1 000)` — not with a minus sign |
| Zero and missing | an em dash, so neither is mistaken for a small value |
| Alignment | tabular lining figures, so digits line up down the column |

A symbol is factored out to the cell edge **only when it is the same on every
row**. The gold columns carry a different prefix per row — `Mgp` on one,
`Ggp` on the next — so there the full symbol stays with its value instead.

### Where none of this applies

`observations.json` and the CSV carry plain integers with no separators,
prefixes or symbols at all, because they are read by machines. The CSV states
each unit in its column heading instead: `Sell (gp/TC)`, `Gold Demand (gp)`.

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

1. **Export JSON**
2. Commit the file as `data/observations.json`

Every visitor then loads that baseline on boot and merges it with their own local
rows. **Import** merges a JSON file back in. Duplicate hashes are skipped
throughout, so re-importing is safe.

## Filename format

```
2026-09-21_124317718_Royal Flyn_Hotkey.jpeg
└── date ──┘└─ time ┘└── character ──┘└ ignored ┘
                 ↑ trailing digits = fractions of a second, dropped
```

Character names may contain spaces but not underscores.

## Files

```
index.html               UI
css/app.css              styles
js/app.js                orchestration, review UI, export/import
js/ocr.js                layout-aware market reader
js/tibiadata.js          API client, caching, BattlEye derivation
js/store.js              IndexedDB + the privacy whitelist
js/filename.js           filename parsing
js/hash.js               SHA-256
data/observations.json   committed baseline (starts empty)
tools/tcmarket.py        optional CLI for the same pipeline (see tools/README.cli.md)
```

`tools/` is independent of the site: a Python CLI that runs the identical
pipeline from a terminal and stores rows in SQLite. Useful for bulk back-fills.

Tesseract.js is loaded from a CDN. Not affiliated with CipSoft.
