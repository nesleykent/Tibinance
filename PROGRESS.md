# Apple Vision review progress

Branch main; restore coverage lost in 2ae4607. No agents launched or restarted. Preserve unrelated tools/validate_archive.py. User confirmed two 2024 historic captures belong to Gentebra.

COMPLETE: all 107 nonaccepted screenshots diagnosed using Apple Vision/Tesseract; 67 complete native readings and four visually verified corrections recovered 71 captures. Final targeted pass completed using existing raw checkpoints and unchanged chronological mixed stream. Root fixes: selected-item crop recheck, original-colors Items/Search sidebar reread, removal of arbitrary ten-row cap. No UI, schema or metric changes.

VALIDATED: 1502 files /1501 images, 426 eligible, 0 duplicates, 390 accepted (388 Offers +2 Statistics), 6659 offer rows /4767 identities, 40 worlds, no pending review/runtime failures. 28 no-Market +3 other-item +5 explicit visual exclusions (two Offer History, combat, Task Board, cursed coin). All 319 previously accepted records/clocks/quotes/UUIDs retained; all 288 pre-rebuild hashes restored; Unebra6→7, previously0. Two Statistics captures unchanged. Anonymous review audit published in data/rebuild-vision-review.json.

BACKUPS: ignored data/rebuilt-market/20261002-vision-review/canonical-before-review.tar.gz and 15-file backup manifest; original 426-event run remains in 20261002-statistics-v6. Final pass checkpoints/logs retained locally, no raw OCR/images/private metadata published.

INSTALLED: validated canonical JSON/CSVs and anonymous rejection/validation audits. market_update.py accepted390 captures/40 worlds and installed byte-identical canonical data.

VERIFICATION COMPLETE: 47 JS tests, all58 tools tests including real Details website/Python parity, all34 report tests, validate.py --reproduce (40 worlds/386 research Offers/4160 forecasts; complementary output byte-identical), report Node204 comparisons/findings/compatibility. Canonical website import390/6659 exact and idempotent. Actual EN/PT reports40 worlds including Unebra,4 Statistics side rows, correct25-TC volumes, responsive controls. All71 exports per language passed at2x with complete tables/PNG download. Real Offers/Details OCR/review/save/export tests passed. All28 Market exclusions additionally visually checked; no Market view. Privacy16 outputs and frozen inputs/ledger checked; final validation against recoverable prior319-record backup passed. Frozen inputs/ledger/order and generated site package equality confirmed.

REGENERATED: results, complement, inflation JSON/monthly/annualCSV, lifecycle, robustness and dist site package. Forecast ledger remains unchanged (2 frozen forecasts,0 scored weeks). Canonical processing-order unchanged. Anonymous107-case recovery audit contains final world coverage and every rejection reason; no names/images/raw OCR published.

DELIVERY: intended code/data/docs only; tools/validate_archive.py remains unrelated and untracked. Publish this final verified revision directly to main and verify the remote hash. The final task response records that commit. No extraction, review, report calculations or validation need to be repeated; all work is complete.

## Details review follow-up

Root cause reproduced on real capture in WebKit: all eight numbers were correctly read, but crop resampling read the title as SLatIstICcS; requiring that title a second time discarded all fields. Chrome previously passed. Fixed shared reader to trust its verified Statistics pane while requiring exact side/field labels, numeric confidence and agreeing OCR values.

Missing fields now carry extraction-specific review reasons; incomplete reads do not enter the value-validation stage. Readable partial fields remain editable. TC Volume stays unavailable until transactions and their25-TC product are safe nonnegative integers. Schema, layout, clocks, confidence rules and canonical data unchanged; no historical processing repeated. Python sanitized review feedback preserves extraction-specific failure categories without raw OCR/private errors.

Verified49JS tests,59Python tools tests including real Details parity,5 downstream schema tests and market-update390/40 compatibility. Real WebKit/Chrome Details populate all8 values; real20-row Offers regression, forced OCR failure, manual recovery, JSON/CSV persistence and responsive EN/PT report fixtures passed. Site package refreshed with shared runtime. Final WebKit reprocess with existing Gentebra context passed: all8 fields,84900/152050TC,enabled save; screenshot inspected and original layout retained.

Complete: final diff/syntax checks passed. Publish this verified follow-up directly to main; final task response records the commit. Canonical data and generated numerical reports remain unchanged. Preserve unrelated tools/validate_archive.py.
