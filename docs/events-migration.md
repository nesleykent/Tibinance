# Events consolidation (2026-10-04)

## Audit and decision

Before this migration the Markets builder combined several sources into 295
records, but consumers silently selected different collections. TC kept global
plus selected-world events; TIB retained only two title-matched token events and
removed the scope picker; Research had a future schedule excluding three short
recurring types, an independent calendar parser and separate historical arrays.
Changing world, asset or page therefore changed the apparent Events truth.

The union was already present in the Markets output: no new occurrence needed
to be invented. The canonical file keeps all 295 IDs and all 35 categories;
`tests/fixtures/canonical-event-ids.json` is an ID-only migration preservation
ledger, not another collection of event definitions. New records may be added
without changing historical IDs.

## Every discovered factual source

| Source before migration | Information | Resolution |
| --- | --- | --- |
| `data/market-events/events.json` | 295 resolved game, world, token, economic and store records | Promoted to `data/events/events.json`, enriched with metadata/provenance |
| `data/market-events/inputs/events.json` | Categories, research classification, prose-only openings/Premium/transfers | Absorbed into canonical categories and records; removed |
| `data/market-events/inputs/api-history.json` | Returned daily event observations and previously unmatched runs | Actual observed days retained as provenance; removed |
| `source-package/events/ev*.txt`, `parse_events.py` | Earlier daily dumps; parser filled short missing-date gaps | Removed after interval/observation migration |
| `source-package/events_intervals.json`, `events_daily.json` | 220 legacy intervals and a redundant daily expansion | Every interval start/type survives; removed |
| `source-package/extra_events.json` | 10 update, Monk and token facts | All 10 canonical occurrences retain sources/confidence; removed |
| `inputs/eventschedule.json` | Official dated schedule, descriptions and timestamp boundaries | Consolidated by occurrence; original timestamps retained; removed |
| `inputs/calendar.ics` | 62 duplicate calendar occurrences, UIDs/descriptions/timestamps | All matched canonical occurrences; complementary evidence retained; removed |
| `mergers.json`, `universe.py`, `lifecycle.py` constants | Merge announcement, birth, transfer and predecessor facts | Canonical records drive JS and Python lifecycle/merge projections; private file/constants removed |
| Current/retired world inventory | World names and completed merge evidence | Offline/merge facts removed from the editable retired-world registry; price-history builder derives them from canonical Events. World characteristics remain registry metadata |
| `results.json` calendar / event occurrences | Independent Research calendar; statistical observations copied event names/days | Private calendar removed; occurrences now reference canonical IDs; study recomputed |
| `source-package/event_occurrences.json`, `report_data.json` updates | Historical reference estimates with copied factual definitions | 154 historical measurements and 10 update estimates linked by canonical ID; dates/definitions removed |
| Event study tables, lifecycle results, report copy, markers and exports | Analytical estimates or rendered facts | Derived consumers, not independent editable Events sources |

Paths under `source-package` and `inputs` above are relative to
`reports/tc-cycle`. Original source paths/hashes remain in `migrationSources`
and per-record provenance; deleted source snapshots are recoverable in Git.
Historical review notes describe their original state and are not live sources.

## Conflicts resolved deliberately

- Legacy recurring intervals/daily tables counted the final calendar day; Markets
  already converted that to inclusive server days. Canonical boundaries retain
  that interpretation. Official server-save timestamps settle overlapping
  scheduled boundaries (e.g. 2026-07-03 to 2026-07-06 08:00 UTC becomes July 3–5
  inclusive). Original calendar boundaries remain in provenance.
- The old parser filled gaps of up to five days. Existing historical intervals
  remain documented inferred intervals; actual returned days are retained
  separately. Missing observations no longer create new continuous intervals.
- The ICS export sometimes uses 08:00/09:00 UTC inconsistently with summer/winter
  server save. Dates agree. Official schedule timestamps take precedence;
  original ICS timestamp, UID and description remain corroborating evidence.
- Token aliases (`Tibia Token launch`, `Tibia Token launched`, fee aliases),
  yearly update titles and Skill/XP classification now live on their one stable
  record and `type`, rather than title-regex selection in TIB.
- A merge announcement and a completed merge/opening are distinct facts, not
  duplicates. Announcement dates, earliest/confirmed merge dates, membership,
  verification date and official citation remain distinct metadata. Completed Terribra merge metadata also preserves its announcement and confirmation dates; publication dates remain provenance metadata.
- The original reference-package statistical estimates remain frozen estimates,
  linked to canonical identities and explicitly labelled with their old
  calendar-day study-window convention. They are not another factual calendar.
  New calculations read canonical boundaries through the shared JS layer.

## Shared contract and consumers

`js/events.js` owns loading, validation, category resolution, ordering, day
arithmetic, explicit queries, lifecycle/merge projections, clustering and export
notes. `tools/events.mjs` exposes that exact model to Python via
`reports/tc-cycle/events_bridge.py`. There is no second Python calendar parser.

TC/TIB use the same Events panel and marker layer. All worlds receive identical
IDs; category and scope controls filter the canonical collection explicitly.
Research's existing calendar table shows the full collection in both editions,
independent of its world picker. Research PNG exports render those same
rows. Market PNGs use the shared chart layer and export notes. Standalone
Research packaging copies the canonical file and shared module, not a private
calendar. Future event work must extend this layer and dataset.

Verification includes canonical ID preservation, duplicates, metadata/date
validation, loader sharing, explicit filter purity, Python projections,
architectural checks against private calendars, marker/export derivation,
Research acceptance checks, and desktop/mobile browser flows across TIB, TC,
Antica, Luzibra, Terribra and both Research editions.
