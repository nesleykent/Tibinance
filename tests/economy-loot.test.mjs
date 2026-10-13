// Loot evidence: {{Loot2}} samples are read as TibiaWiki's own module reads them, so their value per kill equals the
// published Average loot value; that value splits into direct coins and potential NPC conversion.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseLootPage, parseLine, parseItemPrices, valueSample, wikiRound, dropRates, COINS } from '../js/economy-loot.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/loot-parity.json', import.meta.url), 'utf8'));
const prices = new Map(Object.entries(fixture.itemPrices.prices));

test('every sample of the fixture pages reproduces the published Average loot value', () => {
  let n = 0;
  for (const page of fixture.pages) {
    const ours = parseLootPage(page.wikitext).map(s => wikiRound(valueSample(s, prices).total));
    assert.deepEqual(ours, page.published, page.title);
    n += ours.length;
  }
  assert.ok(n >= 30, `${n} samples`);
});

test('a sample splits into direct coins and potential NPC conversion that add up to its value', () => {
  const grimeleech = parseLootPage(fixture.pages.find(p => p.title.endsWith('Grimeleech')).wikitext);
  const newest = grimeleech[0];
  assert.equal(newest.version, '15.32.87b266');
  assert.equal(newest.kills, 7906);
  const v = valueSample(newest, prices);
  // Coins: 91,841 gold coins and 5,358 platinum coins over 7,906 kills.
  assert.ok(Math.abs(v.directCoins - (91841 + 5358 * 100) / 7906) < 1e-9);
  assert.ok(Math.abs(v.directCoins + v.npcPotential - v.total) < 1e-9);
  assert.ok(v.npcPotential > 0 && v.directCoins > 0);
  assert.deepEqual(COINS, { 'Gold Coin': 1, 'Platinum Coin': 100, 'Crystal Coin': 10000 });
});

test('item lines are read exactly as the wiki module reads them, quirks included and flagged', () => {
  assert.deepEqual(parseLine('Gold Coin, times:3540, amount:1-50, total:91841'), { name: 'Gold Coin', times: 3540, total: 91841, amountMin: 1, amountMax: 50, quirks: [] });
  assert.deepEqual(parseLine('Demonic Essence, times:2820, total:1485'), { name: 'Demonic Essence', times: 2820, total: 1485, amountMin: null, amountMax: null, quirks: [] });
  assert.equal(parseLine('Some Wings, times:5').total, 5);
  const quirk = parseLine('Fire Mushroom, times:5, amount:1-5');
  assert.equal(quirk.total, 1, 'the module takes the first number of the third part');
  assert.deepEqual(quirk.quirks, ['amount-without-total']);
});

test('NPC prices: buys only, the highest price, plain or quoted numbers only', () => {
  const lua = `return {
    ["A"] = { ["buys"] = { {["item"] = "Sword", ["price"] = 25}, {["item"] = "Shield", ["price"] = "40"}, {["item"] = "Key", ["price"] = "7 [[Apple]]s"} }, ["sells"] = { {["item"] = "Sword", ["price"] = 999} } },
    ["B"] = { ["buys"] = { {["item"] = "Sword", ["price"] = 30, ["note"] = "x"} }, ["sells"] = { } } }`;
  assert.deepEqual([...parseItemPrices(lua)], [['Sword', 30], ['Shield', 40]]);
});

test('lines without an NPC price are valued at zero and reported; Empty is ignored', () => {
  const [s] = parseLootPage('{{Loot2\n|version=9.9\n|kills=10\n|name=X\n|Empty, times:2\n|Gold Coin, times:8, amount:1-10, total:40\n|Mystery Relic, times:1, amount:1, total:1\n}}');
  const v = valueSample(s, new Map());
  assert.deepEqual([v.directCoins, v.npcPotential, v.unpriced], [4, 0, ['Mystery Relic']]);
});

test('observed drop-rate uncertainty is the binomial interval of times out of kills, nothing more', () => {
  const [s] = parseLootPage('{{Loot2\n|version=1\n|kills=100\n|name=X\n|Gold Coin, times:50, amount:1-10, total:300\n}}');
  const [r] = dropRates(s);
  assert.equal(r.rate, 0.5);
  assert.ok(r.low < 0.5 && r.high > 0.5 && r.low > 0.39 && r.high < 0.61);
});
