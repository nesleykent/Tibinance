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

## Canonical screenshot ingestion from Python

Python calls the website's actual JavaScript filename filter and ingestion functions
through a local Node/Playwright bridge. The filename regex, Market verification,
selected-item proof, API resolution, offer extraction and validation have one source
of truth. No ported Python filter or native-reader fallback participates in ingestion.

The shared order is:

1. Original website filename filter.
2. SHA-256 duplicate check (explicit reprocessing permits saved captures).
3. Original website Market-label and column-heading verification.
4. New highlighted-item verification requiring Tibia Coins.
5. Identify Offers or Details / Statistics, then parse filename local datetime (fractional seconds preserved).
6. Existing website character/world API workflow, awaited before extraction.
7. View-specific extraction: individual offers for Offers; all eight historical Statistics fields for Details.
8. Independent Statistics-side or existing offer validation and anonymous persistence/offer matching.

The source filename and image bytes travel only through local memory/IPC. The
character name is transient input to the existing TibiaData lookup. No source
names, paths, raw API responses or arbitrary OCR/error text enter generated outputs.

```bash
python3 tools/reprocess_market.py /path/to/private-archive \
  --output /path/to/backfill --rebuild
```

Node, Playwright and Chrome must be available. Set `TIBINANCE_NODE_MODULES` to a
Playwright dependency directory when it is not installed locally, `TIBINANCE_NODE`
to the Node executable, and `TIBINANCE_CHROME` to Chrome when needed. Browser OCR
loads the same Tesseract assets as the website; images are processed locally.

An optional `--baseline` supplies existing anonymous capture context, preserving
historical worlds for saved hashes as website reprocessing already does. New captures
resolve through the API; no historical export is required. Enriched observation
exports are not accepted as world context.

`inventory.json` and `summary.json` include entered/passed counts for each canonical
stage, counting executed work rather than cached prior stages. `--resume` only reuses checkpoints from the current ingestion contract;
old native-reader checkpoints are invalidated. Cache reuse still executes the website
filename and SHA duplicate preflight; it skips image/API work exactly like a website
duplicate. Browser closures retain fixed review diagnostics and restart the local
worker for the next image. `--retry-review` retries unresolved
captures. Complete explicit corrections may replace extracted rows, but cannot
bypass the filename, duplicate, Market, selected-item or world gates.

`captures-extracted.json` contains validated captures. The runner then invokes
`finalize_backfill.mjs`, which uses the website's canonical offer matcher and writes
anonymous enriched observations and offer CSVs. Review outputs contain only hashes,
public world/time context, numeric rows and fixed diagnostics.

The old `legacy_archive.mjs` command delegates to this runner. Git-ref readers and
native fallback are retired. Native OCR utilities remain diagnostic tools and do
not determine canonical screenshot eligibility or extraction.

### Details / Statistics in the canonical Python batch

The website bridge accepts Details captures independently of Offers tables. It
uses the same view detection, OCR, side validation, 25-TC lot conversion and
privacy-whitelisted schema as the website. `transactions` counts 25-TC lots;
`tcVolume` is persisted separately for Buy and Sell as `transactions * 25`.
Prices are gold per TC. Invalid or missing fields stay in `needs_review`, with
anonymous `statistics30d` values in the correction template. Correct both sides
completely; corrections cannot bypass filename, Market, selected-item or world
verification. Offers continue through their existing offer validation.

Capture context stores the filename local `capturedAt`, `captureDate`, automatically
detected system IANA `captureTimeZone`, and resolved `capturedAtUtc`. The bridge
obtains the system timezone from Node's local environment; no manual timezone
input is needed. Individual offers preserve local `endsAt` and resolve `endsAtUtc`
in this same timezone using the expiry date's DST rules.

Only Statistics captures add `statisticsReferenceDate`: the previous local calendar
date before that date's locally converted 10:00 Europe/Berlin server save, or the
current local date at/after it. It anchors Statistics history, not ordinary Offers.
The old `--utc-offset` flag remains metadata compatibility only; a fixed offset
does not replace IANA rules. Reprocessing retains saved world/clock/timezone context.

Generated JSON and `observations.csv` contain the mixed capture schema and
Statistics values, while `offer-observations.csv` retains only real offers.
Version 6 invalidates earlier extraction checkpoints. Browser testing state is
isolated from batch output. Do not run the full archive yet: first confirm this
implementation and validation, then rebuild separately into a fresh directory.
The standalone manual-row `tcmarket.py` CLI is separate from this screenshot
pipeline and retains its existing behavior.
