import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { convert, comparePackage, observationOn, historicalCosts } from '../js/coin-costs.js';
import { normalizeRates, validateFx, rateOn, stale } from '../js/foreign-exchange.js';
const fx = [{ day: '2026-10-15', EUR: 1, BRL: 5, USD: 1.25 }];
const prices = { effectiveFrom: '2026-10-15', packages: [{ coins: 250, EUR: 10.35, BRL: 58, USD: 11.59 }, { coins: 15000, EUR: 576.10, BRL: null, USD: null }] };
test('every currency pair round trips without intermediate rounding', () => {
  for (const a of ['EUR','BRL','USD','TIB']) for (const b of ['EUR','BRL','USD','TIB']) {
    const v = convert(57.61, a, b, fx[0], 0.04);
    assert.ok(Math.abs(convert(v, b, a, fx[0], 0.04) - 57.61) < 1e-10);
  }
  assert.equal(convert(10, 'EUR', 'BRL', fx[0], null), 50);
  assert.equal(convert(10, 'EUR', 'TIB', fx[0], null), null);
});
test('official prices remain independent and savings compare unrounded equivalents', () => {
  const original = structuredClone(prices);
  const result = comparePackage(prices.packages[0], 'BRL', fx[0], 0.04);
  assert.deepEqual(prices, original);
  assert.equal(result.cheapest, 'USD');
  assert.ok(Math.abs(result.rows[0].converted - 51.75) < 1e-12);
  assert.equal(result.rows[1].converted, 58);
  assert.ok(Math.abs(result.rows[2].tib - 289.75) < 1e-10);
  assert.equal(result.rows[1].perCoin, 58 / 250);
  assert.ok(Math.abs(result.rows[1].saving - 11.64) < 1e-10);
  assert.ok(Math.abs(result.rows[1].savingRatio - 11.64/58) < 1e-10);
  assert.ok(Math.abs(result.rows[1].premium - (58 / 46.36 - 1)) < 1e-10);
  assert.equal(result.rows[2].saving, 0);
  const only = comparePackage(prices.packages[1], 'USD', fx[0], null);
  assert.equal(only.cheapest, 'EUR'); assert.equal(only.rows[1].converted, null);
  assert.equal(only.rows[0].tib, null); assert.equal(only.rows[0].saving, 0);
});
test('dated manual observations never leak backward and future updates preserve old prices', () => {
  const next = { ...prices, effectiveFrom: '2026-11-01', packages: [{ coins:250, EUR:10.35, BRL:60, USD:12 }] };
  assert.equal(observationOn([prices,next], '2026-10-14'), null);
  assert.equal(observationOn([prices,next], '2026-10-20'), prices);
  assert.equal(observationOn([prices,next], '2026-11-01'), next);
});
test('historical actual prices and constant-price scenarios have distinct coverage', () => {
  const rates = [{day:'2026-10-14',EUR:1,BRL:5,USD:1.25},...fx];
  const tokens = [{day:'2026-10-14',close:0.04}];
  const actual = historicalCosts(rates,tokens,[prices],{coins:250,currency:'BRL',mode:'observed',metric:'cost'});
  assert.deepEqual(actual.map(p=>p.day),['2026-10-15']);
  const scenario = historicalCosts(rates,tokens,[prices],{coins:250,currency:'BRL',mode:'scenario',metric:'cost'});
  assert.equal(scenario.length,2); assert.equal(scenario[0].values.EUR,51.75);
  const power = historicalCosts(rates,tokens,[prices],{coins:250,currency:'BRL',mode:'scenario',metric:'power'});
  assert.deepEqual(power.map(p=>p.day),['2026-10-14']);
  assert.ok(Math.abs(power[0].values.USD - 250/289.75) < 1e-12);
});
test('FX rows require complete same-day ECB pairs and valid positive rates', () => {
  const rows = [{date:'2026-10-15',base:'EUR',quote:'USD',rate:1.25},{date:'2026-10-15',base:'EUR',quote:'BRL',rate:5}];
  assert.deepEqual(normalizeRates(rows),fx);
  for(const invalid of [rows.slice(0,1),[...rows,rows[0]],[{...rows[0],rate:0},rows[1]],[{...rows[0],date:'2026-02-30'},rows[1]]]) assert.throws(()=>normalizeRates(invalid));
  assert.throws(()=>validateFx({schemaVersion:1,provider:'ecb',fetchedAt:'invalid',rates:fx}));
});
test('historical FX uses only prior publications, with bounded age and explicit source date', () => {
  assert.equal(rateOn(fx,'2026-10-14'),null);
  assert.equal(rateOn(fx,'2026-10-17').day,'2026-10-15');
  assert.equal(rateOn(fx,'2026-10-20'),null);
  assert.equal(stale('2026-10-15',new Date('2026-10-16T12:00Z')),false);
  assert.equal(stale('2026-10-15',new Date('2026-10-21T12:00Z')),true);
});
test('supplied October 15 prices are exact and unavailable packages stay unavailable', () => {
  const data=JSON.parse(readFileSync(new URL('../data/coin-prices.json',import.meta.url)));
  assert.equal(data.observations[0].effectiveFrom,'2026-10-15');
  assert.deepEqual(data.observations[0].packages.map(p=>[p.coins,p.EUR,p.BRL,p.USD]),[
    [250,10.35,58,11.59],[750,28.80,162.58,32.25],[1500,57.61,325,64.51],
    [3000,115.22,650,129.02],[4500,172.83,975.67,193.53],[15000,576.10,null,null]
  ]);
});
test('cached FX survives outages, invalid snapshots and unavailable browser storage', async () => {
  const {loadFx} = await import('../js/foreign-exchange.js');
  const file = {schemaVersion:1,provider:'ecb',fetchedAt:'2026-10-15T18:00:00Z',rates:fx};
  let stored=JSON.stringify(file); const storage={getItem:()=>stored,setItem:(_,v)=>{stored=v;}};
  const unavailable=async()=>{throw new Error('offline');};
  assert.equal((await loadFx({fetcher:unavailable,storage})).cached,true);
  const bad=async()=>({ok:true,json:async()=>({...file,rates:[{...fx[0],USD:-1}]})});
  assert.equal((await loadFx({fetcher:bad,storage})).cached,true);
  await assert.rejects(loadFx({fetcher:unavailable,storage:{getItem:()=>null}}));
  const fresh=async()=>({ok:true,json:async()=>file});
  assert.equal((await loadFx({fetcher:fresh,storage:{getItem:()=>{throw new Error('denied')},setItem:()=>{throw new Error('denied')}}})).file.rates[0].BRL,5);
});
test('manual records validate ordering, availability and positive values', async()=>{
  const {validatePrices} = await import('../js/coin-costs.js');
  assert.ok(validatePrices({schemaVersion:1,observations:[prices]}));
  for (const bad of [{...prices,effectiveFrom:'bad'},{...prices,packages:[{coins:250,EUR:0,BRL:58,USD:11}]}]) assert.throws(()=>validatePrices({schemaVersion:1,observations:[bad]}));
  assert.throws(()=>validatePrices({schemaVersion:1,observations:[prices,prices]}));
});
test('incremental FX merge retains older publications and incorporates source corrections', async()=>{
  const {mergeRates}=await import('../tools/fetch_foreign_exchange.mjs');
  const old=[{day:'2026-10-14',EUR:1,BRL:5,USD:1.2},...fx];
  const corrected={...fx[0],BRL:5.1};
  assert.deepEqual(mergeRates(old,[corrected]),[old[0],corrected]);
});
test('local premium ignores display units, excludes unavailable prices and keeps the EUR reference at zero',()=>{
  const rates=[{day:'2026-10-14',EUR:1,BRL:5,USD:1.25},...fx];
  const values=historicalCosts(rates,[],[prices],{coins:250,currency:'TIB',mode:'observed',metric:'premium'});
  assert.equal(values.length,1);assert.equal(values[0].values.EUR,0);
  assert.ok(Math.abs(values[0].values.BRL - (58/5/10.35-1)*100)<1e-10);
  const unavailable=historicalCosts(rates,[],[prices],{coins:15000,currency:'EUR',mode:'scenario',metric:'premium'});
  assert.equal(unavailable[0].values.BRL,null);
});
test('TIB history conversion preserves USD closes, derives EUR and BRL and never uses future FX',async()=>{
  const {chartData}=await import('../js/coin-cost-chart.js');
  const tokens=[{day:'2026-10-14',close:.04},{day:'2026-10-16',close:.05}];
  const rows=chartData(fx,tokens,[prices],{metric:'token',currency:'EUR'});
  assert.equal(rows.length,1);assert.equal(rows[0].fxDay,'2026-10-15');
  assert.deepEqual(rows[0].values,{EUR:.04,BRL:.2,USD:.05});
});
test('FX refresh writes a validated merged snapshot atomically and preserves it on regressing or future responses',async()=>{
  const {refreshFx}=await import('../tools/fetch_foreign_exchange.mjs');
  const {mkdtemp,writeFile,readFile,rm}=await import('node:fs/promises');
  const {tmpdir}=await import('node:os'); const {pathToFileURL}=await import('node:url');
  const dir=await mkdtemp(`${tmpdir()}/tib-fx-`), destination=pathToFileURL(`${dir}/history.json`);
  const before={schemaVersion:1,provider:'ecb',fetchedAt:'2026-10-14T19:00:00Z',rates:[{day:'2026-10-14',EUR:1,USD:1.2,BRL:5}]};
  const rows=day=>[{date:day,base:'EUR',quote:'BRL',rate:5.1},{date:day,base:'EUR',quote:'USD',rate:1.25}];
  try {
    await writeFile(destination,JSON.stringify(before));
    const refreshed=await refreshFx({destination,now:new Date('2026-10-15T19:00:00Z'),fetcher:async()=>({ok:true,json:async()=>rows('2026-10-15')})});
    assert.equal(refreshed.rates.length,2);assert.equal(refreshed.rates[0].day,'2026-10-14');
    const saved=await readFile(destination,'utf8');
    for(const day of ['2026-10-13','2026-10-16']) {
      await assert.rejects(refreshFx({destination,now:new Date('2026-10-15T19:00:00Z'),fetcher:async()=>({ok:true,json:async()=>rows(day)})}));
      assert.equal(await readFile(destination,'utf8'),saved);
    }
    await assert.rejects(readFile(new URL(`${destination.href}.pending`)),{code:'ENOENT'});
  }finally {await rm(dir,{recursive:true,force:true});}
});
test('tied cheapest purchase currencies have zero savings and do not lose availability',()=>{
  const result=comparePackage({coins:250,EUR:10,BRL:50,USD:12.5},'TIB',fx[0],.04);
  assert.deepEqual(result.cheapestCurrencies,['EUR','BRL','USD']);
  assert.ok(result.rows.every(r=>r.saving===0&&r.savingRatio===0));
});
test('inline token chart keeps original USD candles, converts OHLC with same-day FX and leaves gaps',async()=>{
  const {currencyView}=await import('../js/coin-cost-chart.js');
  const base={prices:[{day:'2026-10-14',open:.04,high:.06,low:.03,close:.05,volumeUsd:10},{day:'2026-10-16',open:.05,high:.07,low:.04,close:.06,volumeUsd:20}],events:[]};
  const settings={metric:'token',currency:'USD',coins:250,mode:'scenario'};
  assert.deepEqual(currencyView(base,[],[],settings,null).prices.map(p=>p.close),[.05,.06]);
  const brl=currencyView(base,fx,[],{...settings,currency:'BRL'},null);
  assert.equal(brl.prices.length,1);assert.equal(brl.prices[0].fxDay,'2026-10-15');
  assert.ok(Math.abs(brl.prices[0].high-.28)<1e-12);assert.equal(brl.prices[0].volumeUsd,20);
  assert.deepEqual(currencyView(base,[],[],{...settings,currency:'TIB'},null).prices.map(p=>p.close),[1,1]);
});
test('package calculations are chart series for every available purchasing currency',async()=>{
  const {currencyView}=await import('../js/coin-cost-chart.js');
  const base={prices:[],events:[]};
  const settings={currency:'BRL',coins:250,mode:'observed'};
  for(const [metric,expected] of [['cost',58],['unit',58/250],['saving',11.64],['saving-percent',11.64/58*100],['difference',(58/46.36-1)*100]]) {
    const view=currencyView(base,fx,[prices],{...settings,metric},null);
    assert.equal(view.rows.length,1);assert.ok(Math.abs(view.rows[0].values.BRL-expected)<1e-10);
  }
});
test('current TIB purchasing valuation keeps the prior close date instead of fabricating a candle',async()=>{
  const {currencyView}=await import('../js/coin-cost-chart.js');
  const base={prices:[{day:'2026-10-14',close:.04}],events:[]};
  const view=currencyView(base,fx,[prices],{metric:'cost',currency:'TIB',coins:250,mode:'observed'},null);
  assert.equal(view.rows.length,1);assert.equal(view.rows[0].day,'2026-10-15');
  assert.equal(view.rows[0].tokenDay,'2026-10-14');assert.equal(view.rows[0].current,true);
  assert.ok(Math.abs(view.rows[0].values.USD-289.75)<1e-10);
  assert.deepEqual(base.prices,[{day:'2026-10-14',close:.04}]);
  assert.equal(currencyView({...base,prices:[{day:'2026-10-10',close:.04}]},fx,[prices],{metric:'cost',currency:'TIB',coins:250,mode:'observed'},null).rows.length,0);
});
test('all three purchasing-currency percentage differences are plotted, unavailable routes stay absent',()=>{
  const opts={metric:'pairwise',currency:'BRL',coins:250,mode:'observed'};
  const [row]=historicalCosts(fx,[],[prices],opts);
  assert.ok(Math.abs(row.values.EUR-(58/5/10.35-1)*100)<1e-10);
  assert.ok(Math.abs(row.values.BRL-(11.59/1.25/10.35-1)*100)<1e-10);
  assert.ok(Math.abs(row.values.USD-(11.59/1.25/(58/5)-1)*100)<1e-10);
  assert.deepEqual(historicalCosts(fx,[],[prices],{...opts,coins:15000})[0].values,{EUR:null,BRL:null,USD:null});
});
