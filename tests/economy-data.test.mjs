// Economy page arithmetic: periods, sums with missing days, growth only between complete periods, contributions,
// hypothetical liquidation scenarios and cross-world comparability.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { periodOf, previousPeriod, sumPeriod, growth, series, withLiquidation, contributions, crossWorld } from '../js/economy-data.js';

const world = { first: '2025-08-30', status: 'oooromoo',
  directCoins: [10, 10, 10, 10, 10, null, 10, 10], npcPotential: [5, 5, 5, 5, 5, null, 5, 5], kills: [100, 100, 100, 100, 100, null, 100, 100],
  killsValued: [90, 90, 90, 90, 90, null, 90, 90], playerDeaths: [1, 1, 1, 1, 1, null, 1, 1], grossStable: [14, 14, 14, 14, 14, null, 14, 14] };

test('periods: weeks run Monday to Sunday; months, quarters and years by the calendar', () => {
  assert.deepEqual(periodOf('2025-09-03', 'week'), ['2025-09-01', '2025-09-07']);
  assert.deepEqual(periodOf('2025-09-03', 'month'), ['2025-09-01', '2025-09-30']);
  assert.deepEqual(periodOf('2025-11-15', 'quarter'), ['2025-10-01', '2025-12-31']);
  assert.deepEqual(periodOf('2024-02-10', 'month'), ['2024-02-01', '2024-02-29']);
  assert.deepEqual(previousPeriod(['2025-09-01', '2025-09-30'], 'month'), ['2025-08-01', '2025-08-31']);
});

test('a sum counts the days with data, never a missing day as zero', () => {
  const s = sumPeriod(world, ['2025-08-30', '2025-09-06']);
  assert.deepEqual([s.covered, s.observed, s.recovered, s.missing, s.complete], [7, 6, 1, 1, false]);
  assert.deepEqual([s.directCoins, s.npcPotential, s.grossPotential, s.kills, s.killsValued], [70, 35, 105, 700, 630]);
  assert.equal(s.killCoverage, 0.9);
  const outside = sumPeriod(world, ['2025-08-01', '2025-08-31']);
  assert.deepEqual([outside.covered, outside.outsideData, outside.complete], [2, 29, false]);
});

test('growth only between complete periods', () => {
  const a = sumPeriod(world, ['2025-08-30', '2025-08-31']), b = sumPeriod(world, ['2025-09-01', '2025-09-02']);
  assert.ok(Math.abs(growth(b, a).value) < 1e-12);
  const withGap = sumPeriod(world, ['2025-09-03', '2025-09-04']);
  assert.equal(growth(withGap, b).value, null);
  assert.match(growth(withGap, b).reason, /missing/);
});

test('a series covers every period overlapping the data', () => {
  const w = series(world, 'week');
  assert.deepEqual(w.map(p => p.start), ['2025-08-25', '2025-09-01']);
  assert.deepEqual(w.map(p => p.covered), [2, 5]);
});

test('liquidation scenarios are only the labelled ones: none, a quarter, half, three quarters, all', () => {
  const s = sumPeriod(world, ['2025-08-30', '2025-08-31']);
  assert.equal(withLiquidation(s, 0), 20);
  assert.equal(withLiquidation(s, 1), 30);
  assert.equal(withLiquidation(s, 0.5), 25);
  assert.throws(() => withLiquidation(s, 0.33), /labelled scenarios/);
});

test('contributions sum monthly top lists and say what the listed creatures cover', () => {
  const file = { months: [
    { month: '2025-08', killsValued: 20, directCoins: 300, npcPotential: 100, creatures: [[1, 10, 200, 50], [2, 5, 50, 40]], other: { kills: 5, directCoins: 50, npcPotential: 10 } },
    { month: '2025-09', killsValued: 10, directCoins: 100, npcPotential: 0, creatures: [[2, 10, 100, 0]], other: { kills: 0, directCoins: 0, npcPotential: 0 } },
  ] };
  const c = contributions(file, ['2025-08-01', '2025-09-30']);
  assert.deepEqual(c.rows.map(r => [r.page, r.kills, r.grossPotential]), [[1, 10, 250], [2, 15, 190]]);
  assert.equal(c.total.grossPotential, 500);
  assert.equal(c.rows[0].share, 0.5);
  assert.equal(c.other.directCoins, 50);
  assert.deepEqual(contributions(file, ['2025-09-01', '2025-09-30']).months, ['2025-09']);
});

test('cross-world rows carry the warnings that limit comparison', () => {
  const index = { worlds: [{ world: 'A', dir: 'a', first: '2025-08-30' }, { world: 'B', dir: 'b', first: '2025-09-05' }] };
  const files = new Map([['a', world], ['b', { ...world, first: '2025-09-05' }]]);
  const rows = crossWorld(index, files, ['2025-08-30', '2025-08-31']);
  assert.equal(rows[0].comparable, false, 'kill coverage 90%');
  assert.ok(rows[0].warnings.some(w => /kill coverage/.test(w)));
  assert.ok(rows[1].warnings.includes('no data in this period'));
});

import { median, monthlySums, chartPeriods, brokenLine } from '../js/economy-data.js';
test('no observations are null, while an observed zero remains zero', () => {
  const missing = sumPeriod(world, ['2025-09-04', '2025-09-04']);
  for (const k of ['directCoins', 'npcPotential', 'grossPotential', 'kills', 'playerDeaths']) assert.equal(missing[k], null, k);
  assert.equal(withLiquidation(missing, 1), null);
  const zero = { ...world, directCoins: world.directCoins.map(() => 0), npcPotential: world.npcPotential.map(() => 0) };
  assert.equal(sumPeriod(zero, ['2025-09-01', '2025-09-01']).grossPotential, 0);
});
test('quarterly contribution truncation conserves every component and kill in Other', () => {
  const creatures = Array.from({ length: 40 }, (_, i) => [i, 1, i + 1, 2]);
  const c = contributions({ months: [{ month: '2025-09', killsValued: 40, directCoins: 820, npcPotential: 80,
    creatures, other: { kills: 0, directCoins: 0, npcPotential: 0 } }] }, ['2025-07-01', '2025-09-30']);
  assert.equal(c.rows.length, 30);
  for (const field of ['kills', 'directCoins', 'npcPotential']) assert.equal(c.rows.reduce((s, r) => s + r[field], 0) + c.other[field], c.total[field]);
});
test('monthly comparisons count calendar days, including leap February and no-data worlds', () => {
  const m = monthlySums([['2024-02', 100, 200, 20, 19, 29, 29]], ['2024-02-01', '2024-02-29']);
  assert.equal(m.complete, true); assert.equal(m.grossPotential, 300);
  assert.equal(monthlySums([], ['2024-02-01', '2024-02-29']).grossPotential, null);
});
test('market medians average the middle pair and retain price sample counts independently', () => {
  assert.equal(median([100, 200, null, 400, 300]), 250);
  assert.equal(median([]), null);
  const rows = chartPeriods(world, [['2025-09-01', 100], ['2025-09-02', 200]], 'week');
  assert.equal(rows[1].sell, 150); assert.equal(rows[1].priceDays, 2);
  assert.equal(rows[1].complete, false);
});
test('line segments stop before missing values and never invent a zero', () => {
  assert.deepEqual(brokenLine([{ start: '2025-09-01', n: 4 }, { start: '2025-09-02', n: null }, { start: '2025-09-03', n: 0 }], p => p.n),
    [{ time: '2025-09-01', value: 4, color: 'rgba(0,0,0,0)' }, { time: '2025-09-02' }, { time: '2025-09-03', value: 0 }]);
});


import { readFileSync } from 'node:fs';
test('Economy reuses shared tokens directly and defines no replacement design tokens', () => {
  const css = readFileSync(new URL('../css/economy.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /--[a-z][a-z0-9-]*\s*:/i);
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|rgba?\(/i);
  const html = readFileSync(new URL('../economy.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /type=["']checkbox["']/i);
});
