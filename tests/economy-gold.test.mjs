// Gold generation potential on hand-checkable worlds: valuation per component, coverage, missing and recovered days,
// zero kills, the stable set, point-in-time availability, and no liquidation rate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGold } from '../tools/economy/build_gold.mjs';

const line = (name, total) => ({ name, times: 1, total, amountMin: null, amountMax: null });
const sample = (pageId, version, kills, coins, swords, revTimestamp = '2021-01-01T00:00:00Z') => ({ type: 'sample', pageId, title: `Loot Statistics:C${pageId}`,
  sampleKey: `${pageId}:${version}:0`, contentSha256: `${pageId}${version}${kills}`, version, kills, name: `C${pageId}`, manualAlv: null, quirks: [],
  lines: [line('Gold Coin', coins), line('Sword', swords)], revId: 1, revTimestamp, availableAt: revTimestamp });

function inputs({ days, availability = {} }) {
  // Races: 0 = creature 10 (valued since 8.6), 1 = creature 20 (valued only from 2023-01-01), 2 = unmatched.
  return {
    killstats: { upstreams: [{ id: 'archive', repo: 'r', commit: 'c' }], availability,
      worlds: { Antica: { dir: 'antica', first: days[0].date, last: days.at(-1).date, partitions: { '2022-12': {}, '2023-01': {} } } } },
    map: { summary: { matched: 2, races: 3 }, races: [{ raceId: 0, race: 'a', pageId: 10, creature: 'C10' }, { raceId: 1, race: 'b', pageId: 20, creature: 'C20' }, { raceId: 2, race: 'c', pageId: null }] },
    versions: [{ version: '8.6', date: '2010-07-07' }, { version: '13.0', date: '2023-01-01' }],
    loot: [sample(10, '8.6', 100, 5000, 10), sample(20, '13.0', 200, 20000, 0, '2023-01-15T00:00:00Z')],
    prices: [{ type: 'prices', revId: 9, revTimestamp: '2020-01-01T00:00:00Z', availableAt: '2020-01-01T00:00:00Z', changes: { Sword: 100 } }],
    readPartition: (world, month) => ({ header: {}, days: days.filter(d => d.date.slice(0, 7) === month) }),
  };
}

// Files dated D report the kills of D - 1.
const days = [
  { date: '2022-12-30', rows: [[0, 10, 1], [1, 4, 0], [2, 6, 2]] },           // kill day 12-29: creature 20 not yet valued
  { date: '2022-12-31', rows: [] },                                             // kill day 12-30: zero kills
  // 2023-01-01 missing: kill day 12-31 has no data
  { date: '2023-01-02', rows: [[0, 2, 0], [1, 5, 0]], recoveredFromWeekly: true }, // kill day 2023-01-01: both valued
];

test('values per component, coverage, zero, missing and recovered days, by kill day', () => {
  const files = buildGold({ inputs: inputs({ days }) });
  const w = files.get('worlds/antica.json');
  assert.equal(w.first, '2022-12-29');
  assert.equal(w.status, 'oomr');
  // Kill day 12-29: creature 10 only: 10 kills x 50 gold coins; 10 x (10 swords x 100 / 100 kills).
  assert.deepEqual([w.directCoins[0], w.npcPotential[0], w.kills[0], w.killsValued[0], w.playerDeaths[0]], [500, 100, 20, 10, 3]);
  assert.deepEqual([w.directCoins[1], w.npcPotential[1], w.kills[1]], [0, 0, 0], 'a day with no kills is zero, not missing');
  assert.deepEqual([w.directCoins[2], w.kills[2]], [null, null], 'a missing day is null, never zero');
  // Kill day 2023-01-01 (recovered): 2 x 50 + 5 x 100.
  assert.deepEqual([w.directCoins[3], w.npcPotential[3], w.killsValued[3]], [600, 20, 7]);
  const index = files.get('index.json');
  const a = index.worlds[0];
  assert.deepEqual([a.kills, a.killsValued, a.observed, a.recovered, a.missing], [27, 17, 2, 1, 1]);
  assert.equal(a.killCoverage, 17 / 27);
  assert.equal(index.mode.kind, 'latest-evidence');
});

test('the stable set holds only creatures valued from the first kill day, so newly valued creatures add no growth', () => {
  const w = buildGold({ inputs: inputs({ days }) }).get('worlds/antica.json');
  assert.equal(w.grossStable[0], 600);
  assert.equal(w.grossStable[3], 120, 'creature 20 is newly valued on 2023-01-01 and excluded from the stable series');
});

test('point in time: kill files not yet available and samples uploaded later are excluded', () => {
  const availability = { '2022-12-30': { at: '2022-12-30T05:00:00Z' }, '2022-12-31': { at: '2022-12-31T05:00:00Z' }, '2023-01-02': { at: '2023-01-02T05:00:00Z' } };
  const files = buildGold({ asOf: '2023-01-10T00:00:00Z', inputs: inputs({ days, availability }) });
  const w = files.get('worlds/antica.json');
  // The creature 20 sample was uploaded 2023-01-15: at the cutoff its kills are unvalued.
  assert.deepEqual([w.directCoins[3], w.killsValued[3]], [100, 2]);
  const early = buildGold({ asOf: '2022-12-31T00:00:00Z', inputs: inputs({ days, availability }) }).get('worlds/antica.json');
  assert.equal(early.status, 'ommm', 'files published after the cutoff are not used');
  assert.equal(files.get('index.json').mode.kind, 'point-in-time');
});

test('no liquidation rate is applied: npcPotential is stored as what NPCs would pay, separately from coins', () => {
  const index = buildGold({ inputs: inputs({ days }) }).get('index.json');
  assert.deepEqual([index.worlds[0].directCoins, index.worlds[0].npcPotential], [1100, 120]);
  assert.match(index.note, /potential, not issued gold/);
  assert.equal(index.methodology.rule, 'strict');
});
