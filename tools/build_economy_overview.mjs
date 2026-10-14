// Every world and their All aggregate for Economy: gold/overview.json and gold/worlds/all.json.
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
import { MEASURES, INTERVALS, ratePeriods, rangeChange, dayIndex, lastDay, sumPeriod } from '../js/economy-data.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const GOLD = join(ROOT, 'data/economy/gold');
const OUT = join(GOLD, 'overview.json');
const RANGES = ['1M', '3M', '6M', 'YTD', '1Y', 'All'];
const round6 = x => (x === null ? null : Math.round(x * 1e6) / 1e6);

const readGold = path => JSON.parse(readFileSync(join(GOLD, path), 'utf8'));
const FIELDS = ['directCoins', 'npcPotential', 'kills', 'killsValued', 'playerDeaths', 'grossStable'];

// Sum world-day records once, only within each world's recorded lifetime. A day is available only when every
// included world has data; a partial global sum must never look like a complete one. Recovery stays explicit.
export function aggregateWorlds(worlds) {
  if (!worlds.length) throw new Error('All requires at least one world');
  if (new Set(worlds.map(w => w.world)).size !== worlds.length) throw new Error('duplicate world in All');
  const first = worlds.map(w => w.first).sort()[0], last = worlds.map(lastDay).sort().at(-1);
  const n = dayIndex({ first }, last) + 1, zeros = () => Array(n).fill(0);
  const all = { world: 'All', first, last, ...Object.fromEntries(FIELDS.map(f => [f, zeros()])),
    worldsExpected: zeros(), worldsCovered: zeros() };
  const recovered = Array(n).fill(false);
  for (const w of worlds) {
    const offset = dayIndex(all, w.first);
    for (let j = 0; j < w.status.length; j++) {
      const i = offset + j;
      all.worldsExpected[i]++;
      if (w.status[j] === 'm') continue;
      if (!['o', 'r'].includes(w.status[j])) throw new Error(`invalid status: ${w.world}`);
      all.worldsCovered[i]++;
      recovered[i] ||= w.status[j] === 'r';
      for (const f of FIELDS) {
        const v = w[f]?.[j];
        if (!Number.isSafeInteger(v) || v < 0 || !Number.isSafeInteger(all[f][i] + v)) throw new Error(`invalid ${f}: ${w.world}`);
        all[f][i] += v;
      }
    }
  }
  all.status = all.worldsExpected.map((expected, i) => {
    if (!expected || all.worldsCovered[i] !== expected) {
      for (const f of FIELDS) all[f][i] = null;
      return 'm';
    }
    return recovered[i] ? 'r' : 'o';
  }).join('');
  return all;
}

export function buildAllWorlds(read = readGold) {
  const index = read('index.json');
  return aggregateWorlds(index.worlds.map(w => read(`worlds/${w.dir}.json`)));
}

export function buildOverview(read = readGold, all = buildAllWorlds(read)) {
  const index = read('index.json');
  const totals = sumPeriod(all, [all.first, all.last]);
  const summary = { world: 'All', dir: 'all', first: all.first, last: all.last, days: all.status.length,
    worldCount: index.worlds.length, latestWorldCount: all.worldsExpected.at(-1),
    observed: totals.observed, recovered: totals.recovered, missing: totals.missing,
    kills: totals.kills, killsValued: totals.killsValued, killCoverage: totals.killCoverage,
    directCoins: totals.directCoins, npcPotential: totals.npcPotential };
  const latest = index.worlds.map(w => w.last).sort().at(-1);
  const worlds = [summary, ...index.worlds].map(w => {
    const daily = w.dir === 'all' ? all : read(`worlds/${w.dir}.json`);
    const intervals = Object.fromEntries(INTERVALS.map(unit => {
      const periods = ratePeriods(daily, unit), last = periods.findLast(p => p.rate.grossPotential !== null) ?? null;
      const measures = Object.fromEntries(Object.entries(MEASURES).map(([k, m]) => [k, last ? [Math.round(last.rate[m.field]),
        ...RANGES.map(r => round6(rangeChange(periods, m.field, r)?.ratio ?? null))] : null]));
      return [unit, { last: last ? [last.start, last.end] : null, coverage: last ? round6(last.killCoverage) : null, ...measures }];
    }));
    return { ...(w.dir === 'all' ? summary : {}), world: w.world, dir: w.dir, last: w.last, ended: w.last < latest, ...intervals };
  });
  return { format: 1, note: 'Per world, interval and measure: [gold per day of the latest complete period, change over 1M, 3M, 6M, YTD, 1Y, All]. '
    + 'Built by tools/build_economy_overview.mjs from data/economy/gold/ with the Economy chart\'s own functions; from valued creatures only.',
    ranges: RANGES, through: latest, worlds };
}

export const render = overview => `${JSON.stringify(overview)}\n`;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const all = buildAllWorlds();
  const outputs = new Map([[OUT, render(buildOverview(readGold, all))], [join(GOLD, 'worlds/all.json'), render(all)]]);
  const check = process.argv.includes('--check');
  for (const [path, text] of outputs) {
    if (check) {
      let committed = null;
      try { committed = readFileSync(path, 'utf8'); } catch { /* missing */ }
      if (committed !== text) { console.error(`${path} is not a fresh build: run node tools/build_economy_overview.mjs`); process.exit(1); }
      console.log(`${path} is fresh`);
    } else {
      writeFileSync(path, text);
      console.log(`wrote ${path} (${text.length} bytes)`);
    }
  }
}
