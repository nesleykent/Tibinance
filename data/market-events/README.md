# Markets Events

The calendar, agenda, details, chart markers and exports share `events.json`.
Rebuild it with `node tools/build_market_events.mjs`; verify with `--check`.

Sources:

- TibiaMarket's `/events?start_days_ago=10000&end_days_ago=-1` history, captured on 2026-10-04 in `inputs/api-history.json`. The response begins on 2023-01-30. Its dates are observations, not a promise that every intervening date was captured.
- The existing research intervals retain historical coverage and their provenance, including the research parser's gap repairs.
- Tibia's official calendar snapshot in `reports/tc-cycle/inputs/eventschedule.json`, updated 2026-08-05, supplies descriptions and scheduled server-save boundaries through September 2027. Upcoming dates are this published snapshot, not extrapolated annual recurrences.
- Existing world lifecycle, update and market facts are retained with their original IDs.

The builder classifies every calendar type. Unknown types fail the build instead of silently disappearing. The official schedule supersedes a matching historical interval while retaining its ID. Only consecutive uncovered API observations form new intervals; gaps are never filled. These incomplete observed intervals are identified in their descriptions.

All UI dates are inclusive server days. Official end timestamps are exclusive server-save boundaries, so the ending server day is the preceding date. An API observation on that final calendar date is covered by the scheduled occurrence rather than creating a duplicate.

To refresh history, retrieve the public endpoint above into `inputs/api-history.json`, update its retrieval date in `inputs/events.json`, rebuild and run the Events unit and browser suites. Keep the raw response for provenance. Update the official snapshot when available; do not invent future boost weekends from a recurrence rule.
