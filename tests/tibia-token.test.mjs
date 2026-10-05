import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tokenView, tokenPrice } from '../js/tibia-token.js';
import { changeOver, rangeStart } from '../js/market-series.js';
const file = JSON.parse(readFileSync(new URL('../data/market-history/tibia-token/history.json', import.meta.url)));
test('TIB history reproduces frozen contract-verified candles', () => {
  execFileSync(process.execPath, ['tools/build_tibia_token.mjs', '--check']);
  const view = tokenView(file, null);
  assert.ok(view.prices.length >= 363);
  assert.equal(view.prices[0].day, '2025-10-06');
  assert.equal(view.end, file.prices.at(-1).day);
  assert.ok(view.prices.every(p => p.day < file.asOf));
  assert.equal(tokenPrice(view.byDay.get('2026-10-03').close), '$0.03610');
  assert.equal(view.profile.layers.some(l => l.id === 'activity'), false);
  assert.equal(view.profile.layers.some(l => l.id === 'best-offer'), false);
});
test('TIB rejects wrong assets, units, duplicate days, invalid prices and malformed candles', () => {
  for (const patch of [{asset:'tibia-coin'}, {quote:'gold'}, {timezone:'Europe/Berlin'}, {contract:'0x0'}, {pool:'0x0'},
    {prices:[file.prices[0],file.prices[0]]}, {prices:[{...file.prices[0],close:0}]}, {prices:[{...file.prices[0],high:0.001}]},
    {prices:[{...file.prices[0],volumeUsd:-1}]}, {prices:[{...file.prices[0],day:'2025-02-30'}]}]) assert.throws(() => tokenView({...file,...patch},null));
});
test('token events retain global and world records from the canonical collection', () => {
  const dataset={categories:[{id:'token'}],events:[
    {id:'launch',category:'token',worlds:'all',title:'Tibia Token launch',description:'',start:'2025-01-14',end:'2025-01-14'},
    {id:'game',category:'token',worlds:'all',title:'Rapid respawn',description:''},
    {id:'world',category:'token',worlds:['Antica'],title:'Tibia Token',description:''}]};
  assert.deepEqual(tokenView(file,dataset).events.map(e=>e.id),['launch','game','world']);
});
test('TIB range change compares actual USD closes', () => {
  const view=tokenView(file,null), closes=view.prices.map(p=>({day:p.day,value:p.close}));
  const change=changeOver(closes,rangeStart(view.end,'1M'));
  assert.ok(change.from.day <= rangeStart(view.end,'1M'));
  assert.equal(change.ratio,change.to.value/change.from.value-1);
  assert.equal(tokenView({...file,prices:[]},null).grid.length,0);
});
