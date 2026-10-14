// Race names to creatures: the upstream map, case-insensitive titles, redirects, rule-based singulars accepted only
// when unambiguous, overrides, and unmatched races left unvalued.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNormalizeMap, matchRaces, singulars } from '../tools/economy/map_creatures.mjs';

test('the upstream normalisation map is read with quotes and escapes', () => {
  const m = parseNormalizeMap(`new Map([\n\t['Bloodjaws', 'bloodjaw'],\n\t["paladin's apparitions", "paladin's apparition"],\n\t['A \\'quoted\\' one', 'x'],\n]);`);
  assert.deepEqual([...m], [['Bloodjaws', 'bloodjaw'], ["paladin's apparitions", "paladin's apparition"], ["A 'quoted' one", 'x']]);
});

test('singulars change only the last word, by fixed rules', () => {
  assert.ok(singulars('rabid wolves').includes('rabid wolf'));
  assert.ok(singulars('raubritter marksmen').includes('raubritter marksman'));
  assert.ok(singulars('thorn lilies').includes('thorn lily'));
  assert.ok(singulars('reality reavers').includes('reality reaver'));
  assert.deepEqual(singulars('Abyssador'), []);
});

const lootTitles = [{ title: 'Loot Statistics:Dragon Lord', pageid: 1 }, { title: 'Loot Statistics:Rabid Wolf', pageid: 2 },
  { title: 'Loot Statistics:Nomad (Basic)', pageid: 3 }, { title: 'Loot Statistics:Tarnished Spirit', pageid: 4 }];

test('matching order and methods', () => {
  const normalize = new Map([['dragon lords', 'dragon lord'], ['rabid wolves', 'rabid wolves'], ['nomads', 'nomad'], ['(elemental forces)', '(elemental force)']]);
  const r = matchRaces(['dragon lords', 'rabid wolves', 'nomads', '(elemental forces)', 'old spirits', 'Odd Thing'], {
    normalize, lootTitles, redirects: new Map([['old spirit', 'Tarnished Spirit']]), overrides: { 'Odd Thing': { creature: null, note: 'boss mechanic' } } });
  assert.deepEqual(r.map(x => [x.race, x.method, x.pageId]), [
    ['dragon lords', 'normalized', 1], ['rabid wolves', 'singularized', 2], ['nomads', 'unmatched', null],
    ['(elemental forces)', 'unmatched', null], ['old spirits', 'unmatched', null], ['Odd Thing', 'override', null]]);
  // A redirect is followed for the name itself.
  const r2 = matchRaces(['old spirit'], { normalize: new Map(), lootTitles, redirects: new Map([['old spirit', 'Tarnished Spirit']]) });
  assert.deepEqual([r2[0].method, r2[0].pageId], ['redirect', 4]);
});
