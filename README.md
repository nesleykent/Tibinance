# Tibinance

**Tibia Coins market tracker.** 
A static site for GitHub Pages. Drag in your daily Tibia market screenshots; the
browser hashes them, reads the Sell/Buy tables, resolves the world through
TibiaData, and stores **only anonymous market data**.

No backend, no build step, no API key, no cost.

## What is stored, and what is not

Stored — exactly these nine fields, nothing else:

`World · Type · BattlEye · Sell · Sell Volume · Buy · Buy Volume · Capture Date · Screenshot Hash`

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

Every row is editable, so a partially cut-off offer can be corrected or removed
before saving — it is excluded from the volume sums.

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

Quantities follow **ISO 80000-1 (SI)**: digits are written in groups of three
separated by a thin space, and the unit follows the value.

```
48 784 gp/TC        225 625 TC
```

A comma or a point is never used to group digits, because the two swap meaning
between locales — `48,784` reads as forty-eight thousand in one country and as
`48.784` in another. The thin space is unambiguous everywhere. It is a narrow
no-break space (U+202F), so a quantity never wraps across lines.

Exports are different on purpose: `observations.json` and the CSV carry plain
integers with no separators at all, because those files are read by machines.

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
