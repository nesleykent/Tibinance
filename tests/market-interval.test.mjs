import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateView, periodStart, nextPeriod } from '../js/market-series.js';

test('periods start on Monday and on the 1st', () => {
  assert.equal(periodStart('2026-10-15', 'week'), '2026-10-12');
  assert.equal(periodStart('2026-10-12', 'week'), '2026-10-12');
  assert.equal(periodStart('2026-10-15', 'month'), '2026-10-01');
  assert.equal(nextPeriod('2026-01-31', 'month'), '2026-02-01');
});

test('a week closes on its last best offer, sums transactions and weights the average', () => {
  const side = (transactions, averagePrice) => ({ transactions, averagePrice, highestPrice: averagePrice + 10, lowestPrice: averagePrice - 10 });
  const view = { grid: ['2026-10-12', '2026-10-13', '2026-10-19'], latestDay: '2026-10-19', end: '2026-10-19',
    closes: [{ serverDay: '2026-10-12', sell: 100, buy: 90, observations: 1 }, { serverDay: '2026-10-13', sell: 110, buy: 95, observations: 2 },
      { serverDay: '2026-10-19', sell: 120, buy: 99, observations: 1 }],
    daily: [{ serverDay: '2026-10-12', sell: side(10, 100), provenance: {} }, { serverDay: '2026-10-13', sell: side(30, 200), provenance: { sell: { kind: 'estimated' } } }] };
  const w = aggregateView(view, 'week');
  assert.deepEqual(w.closeDays, ['2026-10-12', '2026-10-19']);
  assert.equal(w.closes[0].sell, 110);
  assert.equal(w.closes[0].observations, 3);
  assert.equal(w.daily[0].sell.transactions, 40);
  assert.equal(w.daily[0].sell.averagePrice, 175);
  assert.equal(w.daily[0].sell.highestPrice, 210);
  assert.equal(w.daily[0].provenance.sell.kind, 'estimated');
  assert.equal(w.step('2026-10-12'), '2026-10-19');
  assert.equal(aggregateView(view, 'day'), view);
});
