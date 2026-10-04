# Canonical Market data correction — 2026-10-04

Both acquisition methods map Buy and Sell to the same canonical Statistics fields:
`transactions`, `highestPrice`, `averagePrice`, `lowestPrice`. Daily and last-30-days
periods remain distinct. Values are preserved; source is provenance, not a separate
market concept. No Statistics counter is converted into actual traded TC quantity.

The previous correction already removed the unsupported conversion from Statistics
normalization, Markets, Research, exports and new persisted data. This completion
adds explicit source provenance to compiled observations, preserves the original
tracker numeric timestamp, retains acquisition-level daily Statistics reports, and
allows independent sources at the same timestamp. Conflicting daily reports remain
available even when the chart projection withholds the day. Four obsolete null
`tcVolume` keys were removed from the public review artifact. Compatibility readers
ignore legacy fields; remaining references are compatibility tests and documentation.

Active offer Amount, separate captured Buy/Sell depth, quoted gold notional, prices,
expiry and identities are unchanged. Actual historical traded TC quantity is unknown.
No Tibia installation or local CipSoft resources were accessed.

## Integrity comparison

| Records | Before | After |
|---|---:|---:|
| Canonical screenshot captures | 467 | 467 |
| Compiled market observations | 13,240 | 13,240 |
| Derived daily Statistics chart records | 45,354 | 45,354 |
| Acquisition-level daily reports | 45,968 source reports | 45,968 explicit provenance records |

All previous compiled values and ordering are unchanged after removing the added
provenance keys from comparison. Canonical captures, including offer rows, are
unchanged. All 164 frozen input files have identical SHA-256 hashes. No Research
analytical output, forecast or ranking changed.

## Verification

- 115 JavaScript regression tests passed, including generated-history reproduction.
- 59 tools Python tests passed (one optional original-image browser test skipped).
- 38 Research Python tests passed.
- Research validation and byte-identical complement reproduction passed.
- 204 premium comparisons, EN/PT findings and runtime compatibility passed.
- Chrome/WebKit Markets checks passed, including both sides and mobile layout.
- Existing Markets browser/image-export and Statistics UI/CSV-export checks passed.
- Research exported all 71 figures per language at 2x, including PNG download.
- Generated-history `--check` and `git diff --check` passed.

The concurrent main changes for Markets layout/events were merged without rewriting
history. The JavaScript suite and generated history/events checks passed again.

## Changed file inventory

The history builder regenerated the complete dataset; its index was byte-identical.
Only the following 116 world artifacts changed. Research packaging was
rebuilt and was byte-identical. The unrelated roadmap is excluded from the commit.

- `README.md`
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
- `data/market-update-review.json`
- `js/market-history.js`
- `tests/market-history.test.mjs`
- `tests/market-metrics.test.mjs`
- `tools/build_market_history.mjs`
- `docs/market-data-correction.md` (this verification record)
