import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { aggregateWorlds } from '../tools/build_economy_overview.mjs';
import { ratePeriods, accumulatedPeriods, sumPeriod, dayIndex } from '../js/economy-data.js';

const world = (name, first, coins, status = 'o'.repeat(coins.length)) => ({ world: name, first, status,
  directCoins: coins, npcPotential: coins.map(v => v === null ? null : v * 2),
  kills: coins.map(v => v === null ? null : v * 10), killsValued: coins.map(v => v === null ? null : v * 9),
  playerDeaths: coins.map(v => v === null ? null : 1), grossStable: coins.map(v => v) });

test('All sums matching days across world lifetimes, including retired worlds without chaining their successors', () => {
  const all = aggregateWorlds([
    world('Retired', '2024-02-28', [10, 20]),
    world('Successor', '2024-03-01', [30, 40]),
    world('Continuous', '2024-02-28', [1, 2, 3, 4], 'oroo'),
  ]);
  assert.equal(all.first, '2024-02-28');
  assert.equal(all.last, '2024-03-02');
  assert.equal(all.status, 'oroo');
  assert.deepEqual(all.directCoins, [11, 22, 33, 44]);
  assert.deepEqual(all.npcPotential, [22, 44, 66, 88]);
  assert.deepEqual(all.worldsExpected, [2, 2, 2, 2]);
  assert.deepEqual(all.worldsCovered, [2, 2, 2, 2]);
  const total = sumPeriod(all, [all.first, all.last]);
  assert.equal(total.grossPotential, 330);
  assert.equal(total.killCoverage, 0.9, 'coverage is a ratio of summed kills');
  assert.deepEqual([total.worldDays, total.worldDaysCovered], [8, 8]);
  for (const interval of ['day', 'week', 'month']) {
    const end = accumulatedPeriods(all, ratePeriods(all, interval), [all.first, all.last]).at(-1);
    assert.equal(end.grossPotential, 330, interval);
  }
});

test('All never presents a partial world sum as a complete global day, and preserves observed zero', () => {
  const all = aggregateWorlds([world('A', '2026-01-01', [10, null, 0], 'omo'), world('B', '2026-01-01', [20, 30, 0])]);
  assert.equal(all.status, 'omo');
  assert.deepEqual(all.directCoins, [30, null, 0]);
  assert.deepEqual(all.worldsExpected, [2, 2, 2]);
  assert.deepEqual(all.worldsCovered, [2, 1, 2]);
  const periods = ratePeriods(all, 'day');
  assert.deepEqual(periods.map(p => p.rate.grossPotential), [90, null, 0]);
  const total = sumPeriod(all, ['2026-01-01', '2026-01-03']);
  assert.deepEqual([total.worldDaysCovered, total.worldDays, total.complete], [5, 6, false]);
  const accumulated = accumulatedPeriods(all, periods, ['2026-01-01', '2026-01-03']);
  assert.equal(accumulated.at(-1).grossPotential, 90);
  assert.equal(accumulated.at(-1).complete, false);
});

test('All kill coverage weights the underlying kills instead of averaging world percentages', () => {
  const a = world('A', '2026-01-01', [10]), b = world('B', '2026-01-01', [20]);
  b.killsValued = [20];
  const total = sumPeriod(aggregateWorlds([a, b]), ['2026-01-01', '2026-01-01']);
  assert.equal(total.killCoverage, 110 / 300);
  assert.notEqual(total.killCoverage, (0.9 + 0.1) / 2);
});

test('All rejects duplicate worlds and invalid amounts instead of double counting or coercing them', () => {
  const a = world('A', '2026-01-01', [1]);
  assert.throws(() => aggregateWorlds([a, a]), /duplicate/i);
  assert.throws(() => aggregateWorlds([world('A', '2026-01-01', [-1])]), /invalid/i);
  assert.throws(() => aggregateWorlds([world('A', '2026-01-01', [null])]), /invalid/i);
  assert.throws(() => aggregateWorlds([]), /world/i);
});

test('committed All history reconciles to every source world and its own overview at every interval', () => {
  const read = p => JSON.parse(readFileSync(new URL(`../data/economy/gold/${p}`, import.meta.url), 'utf8'));
  const index = read('index.json'), sources = index.worlds.map(w => read(`worlds/${w.dir}.json`));
  const all = read('worlds/all.json');
  assert.deepEqual(all, aggregateWorlds(sources));
  for (const date of [all.first, '2023-08-27', '2023-08-28', '2024-02-29', '2025-11-06', all.last]) {
    const at = dayIndex(all, date);
    const included = sources.filter(w => dayIndex(w, date) >= 0 && dayIndex(w, date) < w.status.length);
    for (const field of ['directCoins', 'npcPotential', 'kills', 'killsValued', 'grossStable', 'playerDeaths']) {
      assert.equal(all[field][at], included.reduce((sum, w) => sum + w[field][dayIndex(w, date)], 0), `${date} ${field}`);
    }
    assert.equal(all.worldsExpected[at], included.length);
  }
  for (const field of ['directCoins', 'npcPotential', 'kills', 'killsValued', 'grossStable', 'playerDeaths']) {
    assert.equal(all[field].reduce((sum, v) => sum + v, 0), sources.reduce((sum, w) => sum + w[field].reduce((s, v) => s + v, 0), 0), `whole-history ${field}`);
  }
  const overview = read('overview.json').worlds.find(w => w.world === 'All');
  for (const interval of ['day', 'week', 'month']) {
    const p = ratePeriods(all, interval).findLast(p => p.complete);
    assert.equal(overview[interval].gross[0], Math.round(p.rate.grossPotential));
    assert.equal(overview[interval].coins[0], Math.round(p.rate.directCoins));
    assert.equal(overview[interval].npc[0], Math.round(p.rate.npcPotential));
  }
});
