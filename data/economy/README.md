# Economy data

Estimated **gold generation potential** of each Tibia world, built from public kill statistics and TibiaWiki loot
statistics. The full methodology is in [`docs/economy.md`](../../docs/economy.md) and the approved plan in `docs/economy-plan.md`.

## What the numbers are

| Field | Meaning |
| --- | --- |
| `directCoins` | Coins that valued creatures dropped: gold, platinum and crystal coins at 1, 100 and 10,000 gold |
| `npcPotential` | Other loot of valued creatures at the highest price an NPC pays for it: potential conversion, not gold that entered the game |
| `directCoins + npcPotential` | Estimated gross gold generation potential **from valued creatures** |
| `kills`, `killsValued` | All creature kills observed, and those of creatures with an applicable loot sample; their ratio is kill coverage |
| `playerDeaths` | Players killed by creatures: an activity indicator, not a population |

These are **not** net monetary expansion, money supply, inflation, GDP or a Tibia Coin price model. No NPC
liquidation rate is assumed; any scenario that applies one is labelled as an assumption. Values from valued creatures
are never scaled up to cover unvalued kills.

## Files

- `sources/killstats.json`: the kill-statistics repositories and commits ingested, per world its dates, missing
  dates (never filled) and dates recovered exactly from the weekly counter, per world-month the SHA-256 of the
  source files and of the cached partition, and when each date became available upstream.
- `sources/races.json`: the append-only dictionary of kill-statistics race names.
- `sources/creature-map.json`: each race matched to a TibiaWiki creature with loot statistics, and how.
- `sources/loot/`, `sources/item-prices/`: append-only evidence chunks of every loot-sample version and NPC price
  vintage since 2022-08-23, with the wiki revision that first held each (point-in-time reconstruction).
- `sources/versions.json`: client versions and their release dates.
- `gold/`: the latest-evidence build (`tools/economy/build_gold.mjs`): `index.json`, daily series per world in
  `worlds/`, monthly sums of every world in `monthly.json` (the Economy page's cross-world table), monthly creature
  contributions in `contributions/`, and the samples behind each value in `creatures.json`. `gold-versions.json` lists every build that reached main.
- `population/`: population and activity observations by source.

## Sources and licenses

- Kill statistics: tibia.com via TibiaData, collected by the `tibiamaps/tibia-kill-stats` repositories. They are
  read at pinned commits and not republished. Only derived values and digests are stored here.
- Loot statistics, NPC prices and update dates: TibiaWiki (tibia.fandom.com), **CC-BY-SA**, TibiaWiki contributors.
  The evidence chunks and everything derived from them are shared under the same license.
- Archived GuildStats pages: the Internet Archive's Wayback Machine copies of guildstats.eu. Each observation names
  its capture.
