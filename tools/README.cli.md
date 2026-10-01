# tcmarket — Tibia Coins price database

Automates the whole screenshot → database pipeline. The only step that still needs
eyes is reading the numbers off the Tibia client; everything else (filename parsing,
TibiaData lookups, BattlEye derivation, volume arithmetic, validation, storage,
consolidated output) is executed by the script.

## How it runs

```
filename ──► character + capture timestamp
         ──► TibiaData v4 /character/{name}  ──► world          (live, never cached)
         ──► TibiaData v4 /worlds            ──► PvP type + BattlEye  (6h cache)
         ──► market rows                     ──► best prices + volumes
         ──► validation ──► SQLite (tc_prices.db) ──► markdown table
```

## Usage

One screenshot:

```bash
python3 tcmarket.py add "2026-09-21_124317718_Character Name_Hotkey.jpeg" \
  --sell "30075@48784,8925@48785,125@48790,225@48799,250@48800" \
  --buy  "800@44700,25@44601,250@44600,25@44599,64000@44502"
```

A batch (one consolidated table at the end):

```bash
python3 tcmarket.py add --json batch.json
```

Query the database:

```bash
python3 tcmarket.py table                      # everything, newest first
python3 tcmarket.py table --latest             # newest row per world
python3 tcmarket.py table --battleye Green     # filter
python3 tcmarket.py table --type "Optional PvP" --sort sell
python3 tcmarket.py table --world Luminera --csv
python3 tcmarket.py worlds Antica              # resolved PvP type + BattlEye
```

## Row syntax — and the self-check worth using

Each visible offer is `amount@price`, comma separated. **Optionally** append the
screenshot's Total Price column as `amount@price=total`:

```
30075@48784=1467178800
```

The script then verifies `amount × price == total` for every row. A single misread
digit anywhere in the amount or the price breaks that product, so the row is
rejected before it reaches the database. This turns the Total Price column into a
free checksum on the reading — worth including whenever it is legible.

## Validation, all of it blocking

A row is **not stored** if any of these fire (override with `--force`):

- `amount × price ≠ total` for any row where the total was supplied
- crossed market: best Buy ≥ best Sell (those offers would already have matched)
- the first Sell/Buy row is not the best price (the market is sorted, so this means a misread)
- prices within one side span more than 3× (digit-count error)

Also enforced: duplicate screenshot bytes (SHA-256 when the file exists) and
duplicate `(world, capture time, file)` captures are refused unless `--reprocess`
is passed. The existing `--replace` option is an alias for enrichment: it no
longer deletes and reinserts a capture or overwrites its historical snapshot.

## Persistent offers and reprocessing

Append the exact expiration timestamp, including seconds, after `#`:

```bash
python3 tools/tcmarket.py add "2026-10-01_130000000_Character Name_Hotkey.jpeg" \
  --sell "2850@45995=131085750#2026-10-31T01:28:54" \
  --buy "25@45000=1125000#2026-10-31T12:41:17" \
  --reprocess
```

JSON batches also accept arrays of rows instead of the original string syntax:

```json
[{
  "file": "2026-10-01_130000000_Character Name_Hotkey.jpeg",
  "sell": [{"amount":2850,"price":45995,"total":131085750,"endsAt":"2026-10-31T01:28:54"}],
  "buy": [{"amount":25,"price":45000,"total":1125000,"endsAt":"2026-10-31T12:41:17"}]
}]
```

The CLI uses supplied row readings; automatic image OCR belongs to the browser.
It hashes image bytes when the original file is available. Filename-only input
remains supported and uses the existing capture identity. Databases predating
hash storage are migrated additively; resubmitting the original filename and
capture time attaches the hash to the existing capture during enrichment.
If historical rows sharing that filename/time span multiple worlds, the CLI
refuses to guess. A new image with different bytes cannot replace an already
hashed capture with the same filename/time.

`--reprocess` enriches the original capture in one transaction. Its database ID,
world, timestamp and snapshot aggregates are preserved, and existing captures
skip the live character-world lookup. Repeated reprocessing does not add duplicate
observations. Missing tracked rows or dates reject the update with rollback.

Each offer UUID is scoped by world, side, price and expiration; amount is state.
Identical simultaneous offers receive separate UUIDs and ambiguous matching is
flagged. Backfill can run in any chronological order. No execution or cancellation
events are inferred. Legacy rows without Ends At remain untracked with null UUIDs.
The `offers` and `offer_observations` tables contain the anonymous offer dataset;
the original CLI capture audit fields are retained for compatibility.

Export the observation dataset independently for a world:

```bash
python3 tools/tcmarket.py offers --world Ustebra > ustebra-offers.json
python3 tools/tcmarket.py offers --world Ustebra --csv > ustebra-offers.csv
```

These exports include `world`, `side`, `offerId`, `capturedAt`, `hash`, `rowIndex`,
`amount`, `price`, `total`, `endsAt`, `matchAmbiguous` and `processingVersion`.
They exclude character and filename audit fields. Expiration and capture clocks
have no fabricated timezone. Delete neither original screenshots nor prior JSON
backups until the offer dataset has been checked.

Run the temporary-database tests with:

```bash
python3 -m unittest discover -s tools -p 'test_*.py' -v
```

## BattlEye — derived, never guessed

Taken straight from the authoritative TibiaData fields:

| TibiaData | Output |
|---|---|
| `battleye_protected: false` | Off |
| `battleye_date: "release"` | Green (protected since the world's release) |
| `battleye_date: "<a date>"` | Yellow (protected from that date onward) |

Note the single-world endpoint and the worlds-list endpoint both preserve the
literal `"release"` marker, which is what makes Green and Yellow separable.
Comparing dates against the BattlEye rollout would *not* be reliable: Luminera
(created 2005-07) carries a BattlEye date of 2017-09-05, which sits before the
public rollout.

PvP type is copied verbatim from `pvp_type`, so the source terminology is preserved
(Optional PvP, Open PvP, Retro Open PvP, Hardcore PvP, Retro Hardcore PvP).

## Filename format

```
2026-09-21_124317718_Character Name_Hotkey.jpeg
└── date ──┘└─ time ┘└── character ──┘└ ignored ┘
                 ↑ trailing 718 = fractions, dropped
```

Character names may contain spaces; the parser splits on `_`, so anything after the
character field is ignored. Pass `--character "Name"` to override when a filename is
missing or malformed.

## Files

- `tcmarket.py` — the pipeline
- `tc_prices.db` — SQLite database (raw rows kept per observation for auditing)
- `.api_cache.json` — worlds cache, 6h TTL; delete it or use `worlds --refresh` to bust
- `batch.example.json` — batch format template

## Offline archive OCR on macOS

The optional batch reader runs local Tesseract first, with Apple Vision
[`VNRecognizeTextRequest`](https://developer.apple.com/documentation/vision/vnrecognizetextrequest)
as fallback for missing, invalid or uncertain readings. It uses the same
header-derived Market layout and checksum principles as the browser. Vision
reads enlarged table crops; no screenshot is uploaded. Python with Pillow,
Tesseract, Node.js, and the macOS Swift compiler are required. The Vision helper
is compiled into a temporary directory; no app installation is needed.

Before accepting any offers, both readers verify the exact `Tibia Coins` name
inside the highlighted row of the Market's **Items** list. A search term, an
unselected coin row, or text elsewhere on screen does not establish selection.
The local reader retries uncertain item recognition with Vision. A different
selected item is explicitly reported as `excluded_other_item`; an unread item
stays in manual review. These cases never contribute new coin observations.
If the Search anchor is missed, a larger sidebar crop retries its recognition;
the crop itself cannot establish a selected item. Conflicting numeric/date cells
are retried in tightly bounded row crops. A conflict is cleared only when both
OCR engines agree, with numeric products independently validated. Failed reads
and recovery evidence stay in the audit rather than being silently replaced.

From the repository root:

```bash
python3 tools/reprocess_market.py /path/to/screenshots \
  --baseline /path/to/observations.json --output /path/to/backfill \
  --utc-offset=-03:00
node tools/finalize_backfill.mjs /path/to/backfill
```

The original export supplies historical worlds and capture context by screenshot
hash. Clean extractions must also reproduce previously reviewed snapshot prices,
volumes, gold totals and amounts at best prices. Every supplied image is accounted
for. Automatic screenshots are explicitly excluded under the existing Hotkey
rule. Unknown hashes remain in the review results until their original capture
context is supplied; the batch does not assume a character's current world was
its historical world.

Capture and Market expiration timestamps are local clock values. Keep the displayed
times unchanged; `--utc-offset=-03:00` records a confirmed BRT offset in
`backfill-metadata.json` without converting them. Supply the offset appropriate to
the archive. Unknown hashes need their original world and capture context added
to the baseline before they can be enriched.

Outputs:

- `observations-enriched.json`: an importable copy of the original dataset with
  validated offer observations and canonical UUIDs added. Original captures are
  retained even when OCR fails. Import into the updated browser app.
- `offer-observations.csv`: anonymous validated observations for research.
- `backfill-results.json`: every screenshot hash, its status, partial rows,
  field sources/confidence, selected-item verification, alternative readings and exact review issues.
- `excluded-captures.json`: original baseline captures positively identified as
  another item, preserved separately and excluded from the coin import file.
- `review-report.csv`: screenshot paths and hash, world, capture time, side, 1-based row,
  field and reason; missing table/row information is also explicit.
- `review-corrections.json`: editable complete-row templates for unresolved
  captures. Missing values remain null. Supply every visible row on both sides,
  including rows neither OCR engine recognized, and exact expiration seconds.
  If those manually verified rows differ from an old snapshot's aggregates, set
  `confirmSnapshotDifferences` to `true` to acknowledge the difference. Original
  snapshot aggregates are still preserved.
  For an unread selected item, explicitly set `confirmedSelectedItem` to
  `Tibia Coins` only after visually checking the highlighted row. Numeric/date
  corrections alone cannot bypass item verification.

Conflicting readings remain flagged. Numeric values must satisfy
`amount × price == total`; the reader does not compute a replacement for an
unread cell. Missing rows, unread dates, low confidence, engine failures and
mismatches against manual historical corrections prevent automatic enrichment.
Partial rows survive in the review dataset. The browser's JSON import remains
protected by its privacy whitelist; diagnostic fields do not enter storage.

Locate a review screenshot by hash:

```bash
python3 tools/reprocess_market.py /path/to/screenshots --locate SHA256_HASH
```

Revalidate item selection on an existing batch without repeating offer OCR:

```bash
python3 tools/reprocess_market.py /path/to/screenshots \
  --baseline /path/to/observations.json --output /path/to/backfill \
  --resume --verify-items-only
node tools/finalize_backfill.mjs /path/to/backfill
```

Unconfirmed item checks are retried on resume. Finalization cannot restore old
offer observations for a capture whose selected item is not verified.

Use `--resume --retry-review` to rerun unresolved screenshots after improving
the OCR. Successful extractions are kept; review audits remain until replacement
and prior issues remain in `previousAttempts`. Identical image bytes are queued
only once, with all source paths recorded locally. An updated baseline retries
captures whose world/time context changed. `--exclude-name 'Screenshot.png'`
explicitly retains a user-excluded image as `excluded_manual`, without OCR.

Copy only corrected entries into a separate correction file, then rerun:

```bash
python3 tools/reprocess_market.py /path/to/screenshots \
  --baseline /path/to/observations.json --output /path/to/backfill \
  --resume --corrections /path/to/corrections.json
node tools/finalize_backfill.mjs /path/to/backfill
```

Correction entries replace the complete visible row list for that hash and are
revalidated. Invalid corrections retain the original partial OCR readings and
add a correction error. `--resume` keeps completed OCR checkpoints and reprocesses
explicit correction hashes; newly supplied original images are retried. Run
finalization after the reader finishes. Finalization uses `js/offers.js` and
preserves UUIDs already generated in that output directory across repeated runs.

No archive or generated data is committed automatically. Keep the baseline and
original screenshots while reviewing remaining cases.

## Generate an expanded export in main's legacy schema

When deliberately using main's current character-world lookup for images absent
from an old export, `legacy_archive.mjs` reads the actual OCR, filename, API and
analysis modules from a Git ref without changing that checkout. It requires
Playwright and Chrome; `TIBINANCE_NODE_MODULES` can point to a dependency directory
and `TIBINANCE_CHROME` to an installed browser executable. Compile the local
Vision helper first and pass its path as `TIBINANCE_VISION_BINARY`.

```bash
node tools/legacy_archive.mjs /path/to/screenshots /path/to/old-export.json \
  /path/to/backfill origin/main --native-fallback --utc-offset=-03:00
```

The optional native fallback retries failed main readings locally, then validates
the observed numeric rows through main's original analysis. Expiration failures
stay in its audit; the legacy schema has no expiration field. Only positively
confirmed Tibia Coins captures with validated numeric rows enter
`observations-legacy-expanded.json`. Existing hashes preserve baseline context.
Use that expanded file as `--baseline` for the offer backfill afterward.

`legacy-results.json` retains failed/partial main readings and fallback evidence;
`legacy-review.csv` lists review issues. Retried failures remain in checkpoints
until replaced; interrupted runs retain pending audits. `legacy-context.json`
records the main commit and live lookup time/source, with one lookup per explicit
character name in a batch. Existing native audit rows can supply the fallback
by screenshot hash; their numeric issues still block acceptance. These lookups do not prove the character's historical
world. Correct ambiguous filenames explicitly: an underscore is never
automatically interpreted as a space or apostrophe. Automatic screenshots are
excluded from this bridge; the full backfill separately accounts for all images.
When a newly expanded baseline supplies missing context, normal backfill resume
can reuse cells whose sole issue was that context. It revalidates their numeric
products, dates and legacy snapshot aggregates before accepting them; an explicit
`--retry-review` still repeats OCR.
