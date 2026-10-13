// Values per kill by date and mode: effective dates, availability, retroactive corrections, price vintages, rules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareVersions, versionDater, evidenceAt, candidatesByCreature, valueOn } from '../js/economy-value.js';

const versions = [{ version: '8.6', date: '2010-07-07' }, { version: '12.31', date: '2020-02-18' }, { version: '15.12.c7d92c', date: '2025-10-21' }, { version: '15.32.87b266', date: null }];
const dateOf = versionDater(versions);
const sample = (o) => ({ type: 'sample', pageId: 1, title: 'Loot Statistics:X', lines: [{ name: 'Gold Coin', times: 1, total: o.coins }, { name: 'Sword', times: 1, total: o.swords ?? 0 }],
  kills: o.kills ?? 1000, manualAlv: null, quirks: [], ...o });
const prices = [{ type: 'prices', revId: 10, revTimestamp: '2022-01-01T00:00:00Z', availableAt: '2022-01-01T00:00:00Z', changes: { Sword: 100 } },
  { type: 'prices', revId: 11, revTimestamp: '2024-06-01T00:00:00Z', availableAt: '2024-06-01T00:00:00Z', changes: { Sword: 150 } }];

test('versions order numerically, and undated builds are bounded by the latest dated version below them', () => {
  assert.ok(compareVersions('15.32.87b266', '15.12.c7d92c') > 0);
  assert.ok(compareVersions('8.6', '12.31') < 0);
  assert.ok(compareVersions('12.31.9530', '12.31') > 0);
  assert.deepEqual(dateOf('12.31'), { date: '2020-02-18', basis: 'exact' });
  assert.deepEqual(dateOf('15.32.87b266'), { date: '2025-10-21', basis: 'version-date-bounded', boundVersion: '15.12.c7d92c' });
  assert.deepEqual(dateOf('7.0'), { date: null, basis: 'unknown' });
});

const records = [
  sample({ sampleKey: '1:8.6:0', version: '8.6', contentSha256: 'a', coins: 50000, kills: 1000, revId: 1, revTimestamp: '2021-01-01T00:00:00Z', availableAt: '2021-01-01T00:00:00Z' }),
  // A 12.31 sample uploaded in 2023 (after its effective date) with few kills, then corrected (more kills) in 2024.
  sample({ sampleKey: '1:12.31:0', version: '12.31', contentSha256: 'b', coins: 3000, kills: 50, revId: 2, revTimestamp: '2023-03-01T00:00:00Z', availableAt: '2023-03-01T00:00:00Z' }),
  { type: 'sample-ended', pageId: 1, sampleKey: '1:12.31:0', contentSha256: 'b', revId: 3, revTimestamp: '2024-03-01T00:00:00Z' },
  sample({ sampleKey: '1:12.31:0', version: '12.31', contentSha256: 'c', coins: 80000, swords: 10, kills: 2000, revId: 3, revTimestamp: '2024-03-01T00:00:00Z', availableAt: '2024-03-01T00:00:00Z' }),
];

test('latest evidence applies the corrected sample from its effective date, at the newest prices', () => {
  const e = evidenceAt(records, prices);
  const c = candidatesByCreature(e, dateOf).get(1);
  assert.deepEqual(c.map(x => x.sampleKey), ['1:8.6:0', '1:12.31:0']);
  const v = valueOn(c, '2022-09-01');
  assert.deepEqual([v.directCoins, v.npcPotential, v.flags], [40, 10 * 150 / 2000, []]);
  assert.deepEqual(valueOn(c, '2019-01-01').samples, ['1:8.6:0']);
});

test('point in time sees only what was available then: no later upload, no later correction, older prices', () => {
  const before = candidatesByCreature(evidenceAt(records, prices, '2022-12-31T00:00:00Z'), dateOf).get(1);
  assert.deepEqual(before.map(x => x.sampleKey), ['1:8.6:0'], 'the 12.31 sample was uploaded in 2023');
  assert.equal(valueOn(before, '2022-09-01').directCoins, 50);
  const mid = candidatesByCreature(evidenceAt(records, prices, '2023-06-01T00:00:00Z'), dateOf).get(1);
  const v = valueOn(mid, '2022-09-01');
  assert.equal(v.directCoins, 50, 'the uncorrected 12.31 sample has 50 kills, below the minimum, so 8.6 is preferred');
  assert.equal(valueOn(mid, '2022-09-01', 'strict', 10).directCoins, 60, 'with a lower minimum the uncorrected sample is used');
  const after = evidenceAt(records, prices, '2024-06-02T00:00:00Z');
  assert.equal(after.prices.get('Sword'), 150);
  assert.equal(evidenceAt(records, prices, '2024-05-31T00:00:00Z').prices.get('Sword'), 100);
});

test('rules: strict leaves days before the first effective sample unvalued; extended and pooled are labelled', () => {
  const c = candidatesByCreature(evidenceAt(records.slice(1), prices), dateOf).get(1);
  assert.equal(valueOn(c, '2019-01-01'), null);
  assert.deepEqual(valueOn(c, '2019-01-01', 'extended').flags, ['backward']);
  const all = candidatesByCreature(evidenceAt(records, prices), dateOf).get(1);
  const pooled = valueOn(all, '2022-09-01', 'pooled');
  assert.equal(pooled.directCoins, (50 * 1000 + 40 * 2000) / 3000);
  assert.deepEqual(pooled.flags, ['pooled']);
  assert.equal(valueOn(undefined, '2022-09-01'), null);
});
