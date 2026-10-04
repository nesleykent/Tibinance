import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {dailyTransactionSeries,latestCapturedDepth,addDays} from '../js/market-history.js';
import {marketValues,rangeStart,RANGES} from '../js/market-series.js';
import {STALE_DAYS,endOf,filterRows,miniChart,options,screenerRows,sortRows,transactionsOver} from '../js/market-screener.js';

const read = async path => JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), 'utf8'));
const index = await read('data/market-history/tibia-coin/index.json');
const overview = await read('data/market-history/tibia-coin/overview.json');
const files = new Map();
for (const w of index.worlds) files.set(w.world, await read(`data/market-history/tibia-coin/${w.file}`));

test('the overview is the world files\' own daily transactions and latest captured depth, nothing derived', () => {
  assert.equal(overview.through, index.through);
  const listed = new Map(overview.worlds.map(w => [w.world, w]));
  for (const [world, file] of files) {
    const daily = marketValues(file).daily, entry = listed.get(world);
    const depth = file.observations.findLast(o => 'sellVolume' in o || 'buyVolume' in o);
    if (!daily.length && !depth) { assert.equal(entry, undefined, `${world} has nothing to list`); continue; }
    if (!daily.length) assert.equal(entry.transactions, undefined);
    else {
      const t = entry.transactions;
      assert.equal(t.first, daily[0].serverDay);
      assert.equal(addDays(t.first, t.sell.length - 1), daily.at(-1).serverDay);
      assert.equal(t.sell.length, t.buy.length);
      const byDay = new Map(daily.map(d => [d.serverDay, d]));
      t.sell.forEach((value, i) => {
        const d = byDay.get(addDays(t.first, i));
        assert.equal(value, d?.sell?.transactions ?? null, `${world} sell ${addDays(t.first, i)}`);
        assert.equal(t.buy[i], d?.buy?.transactions ?? null, `${world} buy ${addDays(t.first, i)}`);
      });
    }
    if (!depth) assert.equal(entry.depth, undefined);
    else assert.deepEqual(entry.depth, {capturedAtUtc:depth.capturedAtUtc, serverDay:depth.serverDay,
      ...('sellVolume' in depth ? {sell:depth.sellVolume} : {}), ...('buyVolume' in depth ? {buy:depth.buyVolume} : {})});
  }
  assert.equal(overview.worlds.length, new Set(overview.worlds.map(w => w.world)).size);
});

test('the encoders keep absent days absent and name depth only where a capture carried it', () => {
  const tx = n => ({transactions:n, highestPrice:2, averagePrice:2, lowestPrice:1});
  assert.equal(dailyTransactionSeries([]), null);
  assert.deepEqual(dailyTransactionSeries([{serverDay:'2026-02-27', sell:tx(5), buy:tx(0)}, {serverDay:'2026-03-02', buy:tx(7)}]),
    {first:'2026-02-27', sell:[5, null, null, null], buy:[0, null, null, 7]});
  assert.equal(latestCapturedDepth([{sell:1, buy:1}]), null);
  assert.deepEqual(latestCapturedDepth([{capturedAtUtc:'a', serverDay:'d1', sellVolume:10, buyVolume:20}, {capturedAtUtc:'b', serverDay:'d2', sell:5, buy:4}]),
    {capturedAtUtc:'a', serverDay:'d1', sell:10, buy:20});
});

test('transactions per day average only the days with a figure, inside the range', () => {
  const series = {first:'2026-01-01', sell:[10, null, 30, 0, 50], buy:[1, 1, 1, 1, 1]};
  assert.deepEqual(transactionsOver(series, 'sell', null, '2026-01-05'), {perDay:90 / 4, days:4, total:90, first:'2026-01-01', last:'2026-01-05'});
  // A zero is a real day without trades; a null day is unobserved and does not count.
  assert.deepEqual(transactionsOver(series, 'sell', '2026-01-02', '2026-01-04'), {perDay:15, days:2, total:30, first:'2026-01-03', last:'2026-01-04'});
  assert.equal(transactionsOver(series, 'sell', '2025-12-01', '2026-01-01').perDay, 10);
  assert.equal(transactionsOver(series, 'sell', '2026-01-02', '2026-01-02').perDay, null);
  assert.equal(transactionsOver(series, 'buy', '2026-02-01', '2026-03-01').days, 0);
  assert.equal(transactionsOver(null, 'sell', null, '2026-01-05').perDay, null);
});

test('every row matches the index and the world files for every side and range', () => {
  for (const side of ['sell', 'buy']) for (const range of RANGES) {
    const rows = screenerRows(index, overview, {side, range});
    assert.equal(rows.length, index.worlds.length);
    for (const r of rows) {
      const w = index.worlds.find(x => x.world === r.world), latest = w.latestBestOffer;
      assert.deepEqual([r.sell, r.buy, r.last, r.lastDay], latest ? [latest.sell, latest.buy, latest[side], latest.serverDay] : [null, null, null, null]);
      assert.equal(r.spread, latest ? latest.sell - latest.buy : null);
      assert.equal(r.end, endOf(w, index.through));
      assert.equal(r.start, rangeStart(r.end, range));
      if (r.change) {
        assert.equal(r.delta, r.change.to.value - r.change.from.value);
        assert.equal(r.change.to.value, latest[side]);
        // The mini chart starts on the value the change is measured from and ends on the latest best offer.
        assert.equal(r.points[0].value, r.change.from.value);
        assert.equal(r.points.at(-1).value, latest[side]);
      } else assert.equal(r.ratio, null);
      assert.equal(r.observedInRange, w.bestOfferCloses.some(c => (!r.start || c[0] >= r.start) && c[0] <= r.end));
      // Transactions per day, straight from the world file's daily figures over the range.
      const days = marketValues(files.get(r.world)).daily.filter(d => (!r.start || d.serverDay >= r.start) && d.serverDay <= r.end && d[side]);
      assert.equal(r.txDays, days.length, `${r.world} ${side} ${range}`);
      if (days.length) assert.ok(Math.abs(r.txPerDay - days.reduce((t, d) => t + d[side].transactions, 0) / days.length) < 1e-9);
      else assert.equal(r.txPerDay, null);
      const depth = files.get(r.world).observations.findLast(o => 'sellVolume' in o || 'buyVolume' in o);
      assert.equal(r.depth, depth?.[`${side}Volume`] ?? null);
      assert.equal(r.stale, w.status === 'active' && (!latest || (Date.parse(index.through) - Date.parse(latest.serverDay)) / 864e5 > STALE_DAYS));
    }
  }
});

test('filters combine; a current-data filter keeps only active worlds observed lately', () => {
  const rows = screenerRows(index, overview, {side:'sell', range:'3M'});
  const active = filterRows(rows, {});
  assert.equal(active.length, index.worlds.filter(w => w.status === 'active').length);
  assert.equal(filterRows(rows, {status:'retired'}).length, index.worlds.filter(w => w.status === 'retired').length);
  assert.equal(filterRows(rows, {status:'all'}).length, rows.length);
  assert.deepEqual(filterRows(rows, {query:' ANTI '}).map(r => r.world), ['Antica']);
  const optional = filterRows(rows, {type:'Optional PvP', battleye:'Green', location:'Europe'});
  assert.ok(optional.length && optional.every(r => r.type === 'Optional PvP' && r.battleye === 'Green' && r.location === 'Europe' && r.status === 'active'));
  const current = filterRows(rows, {status:'all', data:'current'});
  assert.ok(current.length && current.every(r => r.status === 'active' && !r.stale && r.last !== null));
  assert.ok(filterRows(rows, {data:'observed'}).every(r => r.last !== null));
  assert.equal(filterRows(rows, {data:'observed'}).length, active.filter(r => r.last !== null).length);
  assert.deepEqual(options(rows, 'type'), ['Optional PvP', 'Open PvP', 'Retro Open PvP', 'Hardcore PvP', 'Retro Hardcore PvP']);
  assert.deepEqual(options(active, 'location'), ['Europe', 'North America', 'Oceania', 'South America']);
});

test('sorting by a figure puts worlds without it last in either direction', () => {
  const rows = [{world:'B', ratio:0.1}, {world:'A', ratio:null}, {world:'C', ratio:-0.2}, {world:'D', ratio:0.1}];
  assert.deepEqual(sortRows(rows, 'ratio', -1).map(r => r.world), ['B', 'D', 'C', 'A']);
  assert.deepEqual(sortRows(rows, 'ratio', 1).map(r => r.world), ['C', 'B', 'D', 'A']);
  assert.deepEqual(sortRows(rows, 'world', -1).map(r => r.world), ['D', 'C', 'B', 'A']);
  const real = sortRows(screenerRows(index, overview, {side:'buy', range:'1Y'}), 'txPerDay', -1);
  const firstNull = real.findIndex(r => r.txPerDay === null);
  assert.ok(firstNull === -1 || real.slice(firstNull).every(r => r.txPerDay === null));
  assert.ok(real.slice(0, firstNull === -1 ? undefined : firstNull).every((r, i, a) => !i || a[i - 1].txPerDay >= r.txPerDay));
});

test('a mini chart joins only real observations: solid for consecutive days, dotted across gaps, time to scale', () => {
  const points = [{day:'2026-01-01', value:10}, {day:'2026-01-02', value:20}, {day:'2026-01-03', value:15}, {day:'2026-01-07', value:30}];
  const m = miniChart(points, {from:'2026-01-01', to:'2026-01-11', width:104, height:44, pad:2});
  // x: 2 + day / 10 * 100; y: 2 + (30 - value) / 20 * 40.
  assert.equal(m.solid, 'M2 42L12 22L22 32');
  assert.equal(m.dotted, 'M22 32L62 2');
  assert.deepEqual(m.last, {x:62, y:2});
  assert.equal(m.base, 42);
  assert.equal(m.area, 'M2 42L12 22L22 32L62 2L62 44L2 44Z');
  // The range's base lies before it, left of the box, so the line enters from the edge.
  const entering = miniChart([{day:'2025-12-27', value:10}, {day:'2026-01-02', value:20}], {from:'2026-01-01', to:'2026-01-11', width:104, height:44, pad:2});
  assert.equal(entering.dotted, 'M-48 42L12 2');
  // One value, or a flat line, sits in the middle; no points, no chart.
  assert.deepEqual(miniChart([{day:'2026-01-05', value:7}], {from:null, to:'2026-01-05', width:100, height:40}).last, {x:4, y:20});
  assert.equal(miniChart([], {from:null, to:'2026-01-05', width:100, height:40}), null);
});
