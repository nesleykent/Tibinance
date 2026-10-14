// Every world at a glance for the Economy watchlist: data/economy/gold/overview.json.
//
//   node tools/build_economy_overview.mjs           write it from data/economy/gold/ (committed files only)
//   node tools/build_economy_overview.mjs --check   fail unless the committed overview is a fresh build
//
// For each world, interval (day, week, month) and measure (gross, coins, npc): the gold per day of its latest
// complete period and the change over every range (1M, 3M, 6M, YTD, 1Y, All), computed with the very functions the
// Economy chart uses (js/economy-data.js ratePeriods and rangeChange), so the list and the chart always agree. Plus the
// latest period's kill coverage and whether the world's data ended. Values are whole gold; ratios keep six decimals.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MEASURES, INTERVALS, ratePeriods, rangeChange } from '../js/economy-data.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const GOLD = join(ROOT, 'data/economy/gold');
const OUT = join(GOLD, 'overview.json');
const RANGES = ['1M', '3M', '6M', 'YTD', '1Y', 'All'];
const round6 = x => (x === null ? null : Math.round(x * 1e6) / 1e6);

export function buildOverview(read = path => JSON.parse(readFileSync(join(GOLD, path), 'utf8'))) {
  const index = read('index.json');
  const latest = index.worlds.map(w => w.last).sort().at(-1);
  const worlds = index.worlds.map(w => {
    const daily = read(`worlds/${w.dir}.json`);
    const intervals = Object.fromEntries(INTERVALS.map(unit => {
      const periods = ratePeriods(daily, unit), last = periods.findLast(p => p.rate.grossPotential !== null) ?? null;
      const measures = Object.fromEntries(Object.entries(MEASURES).map(([k, m]) => [k, last ? [Math.round(last.rate[m.field]),
        ...RANGES.map(r => round6(rangeChange(periods, m.field, r)?.ratio ?? null))] : null]));
      return [unit, { last: last ? [last.start, last.end] : null, coverage: last ? round6(last.killCoverage) : null, ...measures }];
    }));
    return { world: w.world, dir: w.dir, last: w.last, ended: w.last < latest, ...intervals };
  });
  return { format: 1, note: 'Per world, interval and measure: [gold per day of the latest complete period, change over 1M, 3M, 6M, YTD, 1Y, All]. '
    + 'Built by tools/build_economy_overview.mjs from data/economy/gold/ with the Economy chart\'s own functions; from valued creatures only.',
    ranges: RANGES, through: latest, worlds };
}

export const render = overview => `${JSON.stringify(overview)}\n`;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const text = render(buildOverview());
  if (process.argv.includes('--check')) {
    let committed = null;
    try { committed = readFileSync(OUT, 'utf8'); } catch { /* missing */ }
    if (committed !== text) { console.error('data/economy/gold/overview.json is not a fresh build: run node tools/build_economy_overview.mjs'); process.exit(1); }
    console.log('data/economy/gold/overview.json is fresh');
  } else {
    writeFileSync(OUT, text);
    console.log(`wrote data/economy/gold/overview.json (${text.length} bytes)`);
  }
}
