// Incremental TibiaMarket sync: only worlds whose source moved past our newest row are fetched, and a copy that drops
// or changes a held row is never written.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { missingFrom, plan, heldRows } from '../tools/sync_tibiamarket.mjs';

test('a new copy must keep every held row exactly', () => {
  const held = new Map([[1, { time: 1, sell_offer: 10, buy_offer: 9 }], [2, { time: 2, sell_offer: 11, buy_offer: 10 }]]);
  assert.deepEqual(missingFrom(held, [{ time: 1, buy_offer: 9, sell_offer: 10 }, { time: 2, sell_offer: 11, buy_offer: 10 }, { time: 3, sell_offer: 12, buy_offer: 11 }]), []);
  assert.deepEqual(missingFrom(held, [{ time: 1, sell_offer: 10, buy_offer: 9 }]), ['2: dropped']);
  assert.deepEqual(missingFrom(held, [{ time: 1, sell_offer: 10, buy_offer: 8 }, { time: 2, sell_offer: 11, buy_offer: 10 }]), ['1: changed']);
});

test('only worlds whose source update is newer than every copy we hold are due', async () => {
  const antica = await heldRows('Antica');
  const newest = Math.max(...antica.keys());
  const iso = t => new Date(t * 1000).toISOString().slice(0, -1);
  const due = await plan([
    { name: 'Antica', last_update: iso(newest) },          // nothing newer than our copies
    { name: 'Antica', last_update: iso(newest + 86400) },  // a day newer
    { name: 'Nowhere', last_update: '2026-01-01T00:00:00' }, // a world we hold nothing for
    { name: 'Gentebra', last_update: null },
  ]);
  assert.deepEqual(due.map(d => d.world), ['Antica', 'Nowhere']);
  assert.equal(due[0].newest, newest);
});
