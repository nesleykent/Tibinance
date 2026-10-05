# Canonical Events

`events.json` is the only editable Events dataset in Tibinance. `js/events.js` is
its shared model, loader, validation, ordering, query, date and export layer.
Markets (TC, TIB and every world), Research in both languages, chart markers,
PNG/table exports and Python research tools all derive from this collection.
Page, asset and world selection never selects a different collection.

## Schema (format 2)

The root contains `format`, `categories`, `worlds` (known names for validation),
`calendarUpdated` (the inherited official snapshot date), `migrationSources`
(historical source paths and SHA-256 hashes) and `events`.

Each event has:

- `id`: permanent canonical identity. Keep it when correcting dates or copy;
  never regenerate it from a mutable title. Existing IDs survived the migration.
- `title`, `description`: readable facts, never inferred price effects.
- `type`: the event's recurring/type name for analytical grouping, e.g.
  `Summer Update`. `category` references one category ID.
- `start`, `end`: valid ISO days, **inclusive Tibia server days**, starting at
  10:00 Europe/Berlin. A single-day event has the same start and end.
- `assets`: `all`, or a nonempty list of `tibia-coin` / `tibia-token`.
- `worlds`: `all`, or a nonempty list of known world names.
- `entities`: affected entities where useful, e.g. Monk or Tibia Token.
- `provenance`: nonempty source records with a historical `file` or `url`;
  optional original timestamps, observed days, confidence, description, UID,
  date interpretation and source title preserve useful evidence.
- `references`: citation URLs. These provide the convenient citation list;
  provenance additionally records how the evidence was interpreted.
- `merge`, only for world merges: `from`, `into`, `status` (`completed` or
  `announced`), and optional `notBefore`, `confirmedDate`, `verifiedOn`.
  A completed merge may retain `announcedOn` and `confirmedOn` as related facts; source `publishedOn` is distinct from the event day.
  An announcement's event day is its announcement, not its proposed merge day.

Categories define `id`, `label`, `mark`, `group` (`world`, `game`, `market`),
`lifecycle` and `recurring`. Category metadata is resolved by `eventsFor()`.
Records are ordered by start day, category rank and ID. They must not duplicate
IDs or a real occurrence's type/start identity.

## Adding or correcting an event

Edit **this file only**, merge complementary provenance into an existing record,
and supply an official reference where available. Add a category only if the
existing model cannot express the event. Do not add page-local calendars,
hardcoded event arrays, parallel parsers or private generated JSON calendars.

Run `node tools/events.mjs` and `node --test tests/*.test.mjs`. For research,
`events_bridge.py` calls the same JS layer through `node tools/events.mjs --json`;
it does not define or normalize events independently. Analytical outputs store
canonical IDs and measurements, rather than independent dates or definitions.
Rerun the affected research pipeline after changing facts used by a calculation.

## Queries and presentation

`loadEvents()` revalidates the canonical JSON, validates the model, and shares
successful loads. `eventsFor(dataset)` exposes the **entire** collection.
`queryEvents()` only applies explicitly requested metadata/date filters.
The shared Events panel uses it for category/scope filters; date navigation and
agenda period are viewer controls. A chart clips markers to its visible time
window, and an export describes the same visible markers. Neither clipping nor
price-series availability changes the underlying collection. Lifecycle facts
may extend a world's price axis; that is chart geometry, not event selection.

TIB prices are UTC candles. Its events retain Tibia server dates, just like TC
and Research. Never relabel event dates as UTC candle dates.

See [the migration audit](../../docs/events-migration.md) for the source inventory,
boundary conflicts, consolidation and verification contract.
