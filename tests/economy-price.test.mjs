import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sellOfferPeriods } from '../js/economy-data.js';

const worlds = [
  { world: 'A', bestOfferCloses: [['2026-01-05', 10], ['2026-01-06', 100]] },
  { world: 'B', bestOfferCloses: [['2026-01-05', 30]] },
  { world: 'C', bestOfferCloses: [['2026-01-05', 50]] },
];

test('All TC price uses a daily cross-world median, then equal-weight daily medians per interval', () => {
  const days = sellOfferPeriods(worlds, 'day');
  assert.deepEqual(days.get('2026-01-05'), { sell: 30, n: 1, worlds: 3, worldDays: 3 });
  assert.deepEqual(days.get('2026-01-06'), { sell: 100, n: 1, worlds: 1, worldDays: 1 });
  assert.equal(days.has('2026-01-07'), false, 'a missing day is never interpolated or carried forward');
  for (const interval of ['week', 'month']) {
    const p = [...sellOfferPeriods(worlds, interval).values()][0];
    assert.deepEqual(p, { sell: 65, n: 2, worlds: 3, worldDays: 4 });
    assert.notEqual(p.sell, 40, 'pooling world-days would overweight the more heavily sampled day');
  }
});

test('world and day weights stay unique; conflicting duplicate quotes fail instead of changing the median', () => {
  assert.deepEqual(sellOfferPeriods([...worlds, worlds[0]], 'week'), sellOfferPeriods(worlds, 'week'));
  assert.throws(() => sellOfferPeriods([...worlds, { world: 'A', bestOfferCloses: [['2026-01-05', 200]] }], 'day'), /conflict/i);
});

test('individual-world prices retain their period median and invalid or missing prices supply no observation', () => {
  assert.deepEqual(sellOfferPeriods([worlds[0]], 'week').get('2026-01-05'), { sell: 55, n: 2, worlds: 1, worldDays: 2 });
  assert.equal(sellOfferPeriods([], 'day').size, 0);
  assert.equal(sellOfferPeriods([{world:'Empty',bestOfferCloses:[['2026-01-05',null],['2026-01-06',0],['2026-01-07',-1]]}], 'day').size, 0);
});
