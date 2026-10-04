import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEndsAt, extractEndsAt, matchOffers } from '../js/offers.js';

const row = (amount = 100, side = 'sell') => ({ side, rowIndex: 0, amount, price: 50000,
  total: amount * 50000, endsAt: '2026-10-21T12:40:55' });
const match = (world, rows, captures = [], previous = []) => matchOffers(world, rows, captures, previous);

test('expiration preserves seconds and rejects impossible dates and timezone guesses', () => {
  assert.equal(normalizeEndsAt('2026-10-21, 12:40:55'), '2026-10-21T12:40:55');
  assert.equal(normalizeEndsAt('2026-10-21T12:40'), null);
  for (const value of ['2026-02-30T12:00:00', '2026-10-21', '2026-10-21T24:00:00', '2026-10-21T12:00:00Z']) {
    assert.equal(normalizeEndsAt(value), null);
  }
});

test('date OCR requires seconds and a single valid timestamp while ignoring scrollbar noise', () => {
  assert.equal(extractEndsAt('2026-10-21, 09:29:21 5 8'), '2026-10-21T09:29:21');
  assert.equal(extractEndsAt('2026-10-21, 09:29'), null);
  assert.equal(extractEndsAt('2026-10-21, 09:29:211'), null);
  assert.equal(extractEndsAt('2026-02-30, 09:29:21'), null);
  assert.equal(extractEndsAt('2026-10-21, 09:29:21 2026-10-21, 10:29:21'), null);
});

test('date OCR normalizes only whitespace between intact digits and retains strict calendar checks',()=>{
  assert.equal(extractEndsAt('2026-1 1-02, 15:00:38'),'2026-11-02T15:00:38');
  assert.equal(extractEndsAt('2026-11-0 1, 19:2 1:44'),'2026-11-01T19:21:44');
  for(const value of ['2026-1-02, 15:00:38','2026-1 11-02, 15:00:38',
    '2026-1 O-02, 15:00:38','2026-02-3 0, 15:00:38','2026-11-02, 15:00:3'])
    assert.equal(extractEndsAt(value),null);
});

test('imported datasets reuse local canonical IDs for already recognized offers', () => {
  const local = match('Ustebra', [row()]);
  const foreign = match('Ustebra', [row(25)]);
  assert.equal(match('Ustebra', foreign, [{ world: 'Ustebra', offers: local }])[0].offerId, local[0].offerId);
});

test('import retains an additional simultaneous canonical UUID when prior capture has one row', () => {
  const first = match('Ustebra', [row()]);
  const second = match('Ustebra', [first[0], { ...row(), rowIndex: 1 }], [{ world: 'Ustebra', offers: first }]);
  const imported = match('Ustebra', second, [{ world: 'Ustebra', offers: first }]);
  assert.deepEqual(imported.map(r => r.offerId), second.map(r => r.offerId));
});

test('quantity is state; world, side, price and expiration bound identity', () => {
  const first = match('Ustebra', [row()]);
  const captures = [{ world: 'Ustebra', offers: first }];
  assert.equal(match('Ustebra', [row(25)], captures)[0].offerId, first[0].offerId);
  for (const [world, r] of [['Antica', row()], ['Ustebra', row(100, 'buy')],
    ['Ustebra', { ...row(), price: 50001 }], ['Ustebra', { ...row(), endsAt: '2026-10-21T12:40:56' }]]) {
    assert.notEqual(match(world, [r], captures)[0].offerId, first[0].offerId);
  }
});

test('simultaneous identical offers have distinct stable UUIDs and ambiguity metadata', () => {
  const input = [row(), { ...row(), rowIndex: 1 }];
  const first = match('Ustebra', input);
  assert.notEqual(first[0].offerId, first[1].offerId);
  assert.ok(first.every(r => r.matchAmbiguous));
  const captures = [{ world: 'Ustebra', offers: first }];
  assert.deepEqual(match('Ustebra', input, captures, first), first);
  const later = match('Ustebra', [row(50), { ...row(20), rowIndex: 1 }], captures);
  assert.deepEqual(new Set(later.map(r => r.offerId)), new Set(first.map(r => r.offerId)));
  assert.ok(later.every(r => r.matchAmbiguous));
});

test('backfill matching is independent of capture ingestion order', () => {
  const newer = match('Ustebra', [row(20)]);
  const older = match('Ustebra', [row(100)], [{ world: 'Ustebra', offers: newer }]);
  assert.equal(older[0].offerId, newer[0].offerId);
});

test('unread dates remain untracked; metadata cannot cross the privacy whitelist', () => {
  const [r] = match('Ustebra', [{ ...row(), endsAt: null, character: 'Private', image: 'pixels' }]);
  assert.equal(r.offerId, null);
  assert.equal(r.endsAt, null);
  assert.equal(r.character, undefined);
  assert.equal(r.image, undefined);
});

test('import retains UUIDs but rejects cross-world UUID reuse and duplicate row identity', () => {
  const first = match('Ustebra', [row()]);
  const captures = [{ world: 'Ustebra', offers: first }];
  assert.equal(match('Ustebra', first)[0].offerId, first[0].offerId);
  assert.throws(() => match('Antica', first, captures), /UUID/);
  assert.throws(() => match('Ustebra', [row(), row()]), /row/);
});
