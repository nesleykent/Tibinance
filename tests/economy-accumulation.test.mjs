import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accumulatedPeriods, ratePeriods } from '../js/economy-data.js';

const world = { first: '2026-01-01', status: 'ooromoo',
  directCoins: [10, 20, 30, 40, null, 0, 70], npcPotential: [1, 2, 3, 4, null, 0, 7],
  grossStable: [5, 10, 15, 20, null, 0, 35], kills: [1, 2, 3, 4, null, 0, 7],
  killsValued: [1, 2, 3, 4, null, 0, 7], playerDeaths: [0, 0, 0, 0, null, 0, 0] };

test('accumulation sums raw daily gold inside exact inclusive boundaries, including recovered days', () => {
  const rows = accumulatedPeriods(world, ratePeriods(world, 'day'), ['2026-01-02', '2026-01-04']);
  assert.deepEqual(rows.map(p => p.grossPotential), [null, 22, 55, 99, null, null, null]);
  assert.equal(rows[3].directCoins, 90);
  assert.equal(rows[3].npcPotential, 9);
  assert.equal(rows[3].grossStable, 45);
  assert.deepEqual([rows[3].covered, rows[3].days, rows[3].complete], [3, 3, true]);
});

test('missing days stay unavailable and subsequent totals explicitly carry partial coverage; observed zero counts', () => {
  const rows = accumulatedPeriods(world, ratePeriods(world, 'day'), ['2026-01-01', '2026-01-07']);
  assert.deepEqual(rows.map(p => p.grossPotential), [11, 33, 66, 110, null, 110, 187]);
  assert.deepEqual([rows[5].covered, rows[5].days, rows[5].complete], [5, 6, false]);
  assert.deepEqual([rows[6].covered, rows[6].days, rows[6].complete], [6, 7, false]);
});

test('week and month bins clip boundary days and yield the same exact selected-range subtotal', () => {
  for (const interval of ['day', 'week', 'month']) {
    const rows = accumulatedPeriods(world, ratePeriods(world, interval), ['2026-01-02', '2026-01-06']);
    const end = rows.findLast(p => p.grossPotential !== null);
    assert.equal(end.grossPotential, 99, interval);
    assert.deepEqual([end.covered, end.days, end.complete], [4, 5, false], interval);
  }
});

test('no covered days never becomes a zero total, including a range outside world history', () => {
  for (const bounds of [['2026-01-05', '2026-01-05'], ['2025-12-01', '2025-12-31']]) {
    const rows = accumulatedPeriods(world, ratePeriods(world, 'day'), bounds);
    assert.ok(rows.every(p => p.grossPotential === null));
  }
});

test('an observed zero is a complete zero accumulation', () => {
  const rows = accumulatedPeriods(world, ratePeriods(world, 'day'), ['2026-01-06', '2026-01-06']);
  assert.equal(rows[5].grossPotential, 0);
  assert.deepEqual([rows[5].covered, rows[5].days, rows[5].complete], [1, 1, true]);
});
