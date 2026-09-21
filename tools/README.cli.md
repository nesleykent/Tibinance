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
python3 tcmarket.py add "2026-09-21_124317718_Royal Flyn_Hotkey.jpeg" \
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

Also enforced: a duplicate `(world, capture time, file)` is refused unless
`--replace` is passed, so re-processing a batch cannot double-count.

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
2026-09-21_124317718_Royal Flyn_Hotkey.jpeg
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
