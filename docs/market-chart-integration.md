# Global Markets integration verification

## Root cause and correction

The histogram already plotted `view.dailyByDay.get(day)[side].transactions`, not
legacy `tcVolume`. Its legend used the same daily map. No plotted-bar/legend-N/A
mismatch was found. Daily Average used `file.dailyStatistics` and the same side.

The systemic integration defect was that the loader used only the old strict daily
projection and ignored the timestamped canonical `dailyStatisticsObservations`.
That projection withheld 22 days with disagreeing reports, losing all eight Buy/Sell
Statistics fields for those days. The shared selector now picks the latest valid
acquisition for each side/reference day without source precedence, retains per-side
provenance, and rejects conflicting equal timestamps explicitly. Shared marketValues
and statisticsAt functions feed chart layers and legend; image exports use the same
chart layers. All source observations remain intact.

## Global audit

All 116 world histories were inspected. Five worlds had omissions: Gentebra (1),
Jadebra (1), Nevia (18), Quintera (1), Yonabra (1). The complete date inventory is
in `market-chart-integration-audit.json`, reproduced by
`node tools/audit_market_chart.mjs --check`.

| Availability (Buy and Sell side values counted separately) | Before | After |
|---|---:|---:|
| Number of Transactions | 90,706 | 90,750 |
| Canonical daily Average Price fields | 90,706 | 90,750 |
| Plottable Daily Average points (positive activity) | 90,326 | 90,370 |
| Highest Price | 90,706 | 90,750 |
| Lowest Price | 90,706 | 90,750 |
| Best Sell Offer daily points | 12,720 | 12,720 |
| Best Buy Offer daily points | 12,720 | 12,720 |

176 missing canonical fields are restored. Missing eligible values, orphan chart
values, histogram/legend mismatches, source-based omissions, date shifts, incorrect
observation deduplication and legacy chart dependencies are zero after correction.

The Gentebra 2026-10-03 example has Best Sell Offer 46,794 and rolling Sell
Statistics of 6,137 transactions and Average Price 46,140. It has no daily Statistics.
Daily Average and daily Transactions therefore correctly remain N/A on that date.
Rolling 30-day data is preserved; neither source is reinterpreted as daily data.

All 13,240 compiled observations and 45,968 daily acquisition reports are unchanged.
All previously selected daily values are unchanged. Daily chart records increase
from 45,354 to 45,376. All 467 canonical captures, offers, identities, timestamps,
and 164 frozen input files are unchanged. No price, forecast or ranking changed.

## Verification

- 118 JavaScript tests passed, including all-world chart/legend/source invariants.
- 59 tools Python tests passed (one optional original-image check skipped).
- 38 Research Python tests and validation/reproduction passed byte for byte.
- Chrome and WebKit existing Markets suites passed, including image exports.
- Chrome and WebKit new global browser checks passed all 22 restored dates across
  eight worlds, both sides, All/3M ranges, rolling-only and empty cases, and mobile.
- History, event and audit artifacts reproduce; git diff whitespace checks pass.

Concurrent event-calendar work was committed separately as `9db4713` and remains
intact. Browser verification covered both an isolated correction copy and the final
combined checkout. One combined Chrome run closed unexpectedly; the complete suite
was rerun successfully before completion.

## Changed files

The builder regenerated all 116 world artifacts plus the index. Frozen sources were
not modified. Complete correction inventory:

- `README.md`
- `js/market-chart.js`
- `js/market-history.js`
- `js/market-series.js`
- `js/markets.js`
- `tools/build_market_history.mjs`
- `tools/audit_market_chart.mjs`
- `tests/market-history.test.mjs`
- `tests/market-global.test.mjs`
- `tests/market-global-browser.mjs`
- `docs/market-chart-integration-audit.json`
- `data/market-history/tibia-coin/index.json`
- `data/market-history/tibia-coin/worlds/aethera.json`
- `data/market-history/tibia-coin/worlds/ambra.json`
- `data/market-history/tibia-coin/worlds/antica.json`
- `data/market-history/tibia-coin/worlds/astera.json`
- `data/market-history/tibia-coin/worlds/belobra.json`
- `data/market-history/tibia-coin/worlds/blumera.json`
- `data/market-history/tibia-coin/worlds/bona.json`
- `data/market-history/tibia-coin/worlds/bravoria.json`
- `data/market-history/tibia-coin/worlds/calmera.json`
- `data/market-history/tibia-coin/worlds/cantabra.json`
- `data/market-history/tibia-coin/worlds/celebra.json`
- `data/market-history/tibia-coin/worlds/celesta.json`
- `data/market-history/tibia-coin/worlds/citra.json`
- `data/market-history/tibia-coin/worlds/collabra.json`
- `data/market-history/tibia-coin/worlds/descubra.json`
- `data/market-history/tibia-coin/worlds/dia.json`
- `data/market-history/tibia-coin/worlds/divina.json`
- `data/market-history/tibia-coin/worlds/dracobra.json`
- `data/market-history/tibia-coin/worlds/eclipta.json`
- `data/market-history/tibia-coin/worlds/epoca.json`
- `data/market-history/tibia-coin/worlds/escura.json`
- `data/market-history/tibia-coin/worlds/esmera.json`
- `data/market-history/tibia-coin/worlds/etebra.json`
- `data/market-history/tibia-coin/worlds/ferobra.json`
- `data/market-history/tibia-coin/worlds/fibera.json`
- `data/market-history/tibia-coin/worlds/firmera.json`
- `data/market-history/tibia-coin/worlds/flamera.json`
- `data/market-history/tibia-coin/worlds/floribra.json`
- `data/market-history/tibia-coin/worlds/gentebra.json`
- `data/market-history/tibia-coin/worlds/gladera.json`
- `data/market-history/tibia-coin/worlds/gladibra.json`
- `data/market-history/tibia-coin/worlds/gravitera.json`
- `data/market-history/tibia-coin/worlds/harmonia.json`
- `data/market-history/tibia-coin/worlds/havera.json`
- `data/market-history/tibia-coin/worlds/honbra.json`
- `data/market-history/tibia-coin/worlds/hostera.json`
- `data/market-history/tibia-coin/worlds/idyllia.json`
- `data/market-history/tibia-coin/worlds/ignibra.json`
- `data/market-history/tibia-coin/worlds/ignitera.json`
- `data/market-history/tibia-coin/worlds/inabra.json`
- `data/market-history/tibia-coin/worlds/issobra.json`
- `data/market-history/tibia-coin/worlds/jacabra.json`
- `data/market-history/tibia-coin/worlds/jadebra.json`
- `data/market-history/tibia-coin/worlds/jaguna.json`
- `data/market-history/tibia-coin/worlds/jinxibra.json`
- `data/market-history/tibia-coin/worlds/junera.json`
- `data/market-history/tibia-coin/worlds/kalanta.json`
- `data/market-history/tibia-coin/worlds/kalibra.json`
- `data/market-history/tibia-coin/worlds/kalimera.json`
- `data/market-history/tibia-coin/worlds/kanda.json`
- `data/market-history/tibia-coin/worlds/karmeya.json`
- `data/market-history/tibia-coin/worlds/lobera.json`
- `data/market-history/tibia-coin/worlds/luminera.json`
- `data/market-history/tibia-coin/worlds/lutabra.json`
- `data/market-history/tibia-coin/worlds/luzibra.json`
- `data/market-history/tibia-coin/worlds/maligna.json`
- `data/market-history/tibia-coin/worlds/malivora.json`
- `data/market-history/tibia-coin/worlds/menera.json`
- `data/market-history/tibia-coin/worlds/monstera.json`
- `data/market-history/tibia-coin/worlds/monza.json`
- `data/market-history/tibia-coin/worlds/mystera.json`
- `data/market-history/tibia-coin/worlds/nefera.json`
- `data/market-history/tibia-coin/worlds/nevia.json`
- `data/market-history/tibia-coin/worlds/noctalia.json`
- `data/market-history/tibia-coin/worlds/obscubra.json`
- `data/market-history/tibia-coin/worlds/oceanis.json`
- `data/market-history/tibia-coin/worlds/ombra.json`
- `data/market-history/tibia-coin/worlds/opulera.json`
- `data/market-history/tibia-coin/worlds/ourobra.json`
- `data/market-history/tibia-coin/worlds/pacera.json`
- `data/market-history/tibia-coin/worlds/peloria.json`
- `data/market-history/tibia-coin/worlds/penumbra.json`
- `data/market-history/tibia-coin/worlds/premia.json`
- `data/market-history/tibia-coin/worlds/quebra.json`
- `data/market-history/tibia-coin/worlds/quelibra.json`
- `data/market-history/tibia-coin/worlds/quidera.json`
- `data/market-history/tibia-coin/worlds/quintera.json`
- `data/market-history/tibia-coin/worlds/rasteibra.json`
- `data/market-history/tibia-coin/worlds/refugia.json`
- `data/market-history/tibia-coin/worlds/retalia.json`
- `data/market-history/tibia-coin/worlds/runera.json`
- `data/market-history/tibia-coin/worlds/secura.json`
- `data/market-history/tibia-coin/worlds/serdebra.json`
- `data/market-history/tibia-coin/worlds/sinistra.json`
- `data/market-history/tibia-coin/worlds/solidera.json`
- `data/market-history/tibia-coin/worlds/sombra.json`
- `data/market-history/tibia-coin/worlds/sonira.json`
- `data/market-history/tibia-coin/worlds/stralis.json`
- `data/market-history/tibia-coin/worlds/talera.json`
- `data/market-history/tibia-coin/worlds/temera.json`
- `data/market-history/tibia-coin/worlds/tempestera.json`
- `data/market-history/tibia-coin/worlds/terribra.json`
- `data/market-history/tibia-coin/worlds/thyria.json`
- `data/market-history/tibia-coin/worlds/tornabra.json`
- `data/market-history/tibia-coin/worlds/ulera.json`
- `data/market-history/tibia-coin/worlds/unebra.json`
- `data/market-history/tibia-coin/worlds/ustebra.json`
- `data/market-history/tibia-coin/worlds/vandera.json`
- `data/market-history/tibia-coin/worlds/venebra.json`
- `data/market-history/tibia-coin/worlds/victoris.json`
- `data/market-history/tibia-coin/worlds/vitera.json`
- `data/market-history/tibia-coin/worlds/vunira.json`
- `data/market-history/tibia-coin/worlds/wadira.json`
- `data/market-history/tibia-coin/worlds/wickera.json`
- `data/market-history/tibia-coin/worlds/wildera.json`
- `data/market-history/tibia-coin/worlds/wintera.json`
- `data/market-history/tibia-coin/worlds/xybra.json`
- `data/market-history/tibia-coin/worlds/xyla.json`
- `data/market-history/tibia-coin/worlds/xymera.json`
- `data/market-history/tibia-coin/worlds/yara.json`
- `data/market-history/tibia-coin/worlds/yonabra.json`
- `data/market-history/tibia-coin/worlds/yovera.json`
- `data/market-history/tibia-coin/worlds/yubra.json`
- `data/market-history/tibia-coin/worlds/zephyra.json`
- `data/market-history/tibia-coin/worlds/zuna.json`
- `data/market-history/tibia-coin/worlds/zunera.json`
- `docs/market-chart-integration.md` (this record)
