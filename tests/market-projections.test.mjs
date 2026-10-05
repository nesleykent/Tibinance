import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {CONDITIONS,axisDays,exportLines,forwardDays,forwardEnd,limits,projectionFor,weekOf} from '../js/market-projections.js';
import {STATUS,buildMarketProjections,expected,readInputs,OUTPUT} from '../tools/build_market_projections.mjs';
import {addDays} from '../js/market-history.js';

const json = async path => JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), 'utf8'));
const dataset = await json(OUTPUT);
const results = await json('reports/tc-cycle/results.json');
const index = await json('data/market-history/tibia-coin/index.json');
const summary = world => index.worlds.find(w => w.world === world);
const last = world => { const l = summary(world).latestBestOffer; return l && {serverDay: l.serverDay, sell: l.sell, buy: l.buy}; };
const fmt = v => new Intl.NumberFormat('en-US').format(Math.round(v));

test('the committed projections are a fresh build of the Research outputs', async () => {
  assert.equal(await readFile(new URL(`../${OUTPUT}`, import.meta.url), 'utf8'), await expected());
  assert.deepEqual(dataset.inputs.map(i => i.path), ['reports/tc-cycle/results.json', 'reports/tc-cycle/market-update.json', 'data/market-history/tibia-coin/index.json']);
  assert.equal(dataset.source.asOf, results.asOf);
  assert.equal(dataset.source.benchmark, 'Antica');
});

test('every projected value is the Research\'s own, rounded to whole gold, with its condition', () => {
  const research = new Map(results.worldForecast.map(r => [`${r.world} ${r.side} ${r.date}`, r]));
  let n = 0;
  for (const w of dataset.worlds) for (const [side, key] of [['sell', 'ask'], ['buy', 'bid']]) for (const [day, central, low, high, condition] of w[side]) {
    const r = research.get(`${w.world} ${key} ${day}`);
    assert.ok(r, `${w.world} ${side} ${day}`);
    assert.equal(condition, STATUS[r.status]);
    assert.deepEqual([central, low, high], [r.base, r.low, r.high].map(v => v == null ? null : Math.round(v)));
    n++;
  }
  assert.equal(n, results.worldForecast.length, 'nothing left out, nothing added');
  assert.deepEqual(dataset.worlds.map(w => w.world), results.worlds.map(w => w.world));
});

test('the horizon is the Research\'s: 52 weekly points from a week after its cutoff', () => {
  const weeks = [...new Set(results.forecast.map(f => f.date))];
  assert.deepEqual(dataset.method, {model: 'C+S+H', stepDays: 7, horizonWeeks: 52, first: addDays(results.asOf, 7), last: weeks.at(-1)});
  for (const w of dataset.worlds) assert.deepEqual(w.sell.map(r => r[0]), weeks);
  // The benchmark's world scenario is the benchmark forecast itself: no local stress.
  const antica = dataset.worlds.find(w => w.world === 'Antica');
  const bench = results.forecast.filter(f => f.side === 'ask');
  assert.deepEqual(antica.sell.map(r => r.slice(1, 4)), bench.map(f => [f.base, f.low, f.high].map(Math.round)));
});

test('every Research anchor is the world\'s last best offer in Markets, on the same server day', () => {
  for (const w of dataset.worlds) {
    const m = last(w.world);
    assert.deepEqual([w.anchor.serverDay, w.anchor.sell, w.anchor.buy], [m.serverDay, m.sell, m.buy], w.world);
  }
  // A capture dated by its local calendar day, taken before the 10:00 Berlin save, belongs to the server day before.
  const etebra = dataset.worlds.find(w => w.world === 'Etebra');
  assert.deepEqual([etebra.anchor.researchDate, etebra.anchor.serverDay, etebra.anchor.source], ['2026-09-26', '2026-09-25', 'capture']);
});

test('the builder refuses what it cannot carry over faithfully', async () => {
  const inputs = await readInputs();
  const build = change => () => buildMarketProjections(change(structuredClone(inputs)));
  assert.throws(build(i => { i.results.worldForecast[0].status = 'Otimista'; return i; }), /unknown condition Otimista/);
  assert.throws(build(i => { i.results.worldForecast[0].low = i.results.worldForecast[0].base + 1; return i; }), /band does not hold/);
  assert.throws(build(i => { const r = i.results.worldForecast.find(x => x.status === 'Suspenso: fusão anunciada'); r.base = 1; return i; }), /suspended week has a value/);
  assert.throws(build(i => { i.results.worldForecast.pop(); return i; }), /weeks differ/);
  assert.throws(build(i => { i.index.worlds = i.index.worlds.filter(w => w.world !== 'Floribra'); return i; }), /Floribra is projected by the Research but is not a Markets world/);
  assert.throws(build(i => { i.results.forecast[0].date = addDays(i.results.asOf, 1); return i; }), /a week after the cutoff|7 days apart/);
});

test('a projection is placed only on its own anchor, and says why when it is not', () => {
  const antica = projectionFor(dataset, summary('Antica'), last('Antica'));
  assert.equal(antica.sell.available, true);
  assert.deepEqual(antica.sell.anchor, {day: '2026-10-04', value: 43255});
  assert.deepEqual(antica.buy.anchor, {day: '2026-10-04', value: 41704});
  assert.equal(antica.sell.points.length, 52);
  assert.deepEqual([antica.sell.confidence, antica.sell.limits], ['limited', ['stale quote']]);
  // A newer observation than the Research's anchor: never moved to it, unavailable until the Research is rebuilt.
  const newer = projectionFor(dataset, summary('Antica'), {...last('Antica'), serverDay: '2026-10-05'});
  assert.equal(newer.sell.available, false);
  assert.match(newer.sell.reason, /starts from the best offer of 2026-10-04; Antica was observed later, on 2026-10-05/);
  // The same day but another price (one side only) is not the same anchor either.
  const moved = projectionFor(dataset, summary('Antica'), {...last('Antica'), buy: 41705});
  assert.deepEqual([moved.sell.available, moved.buy.available], [true, false]);
  for (const [world, reason] of [['Aethera', /not among them/], ['Jacabra', /retired world/]]) {
    const p = projectionFor(dataset, summary(world), last(world));
    assert.equal(p.sell.available, false, world);
    assert.match(p.sell.reason, reason);
  }
  assert.match(projectionFor(dataset, {world: 'Antica', status: 'active'}, undefined).sell.reason, /No market data/);
  assert.match(projectionFor(null, summary('Antica'), last('Antica')).sell.reason, /could not be loaded/);
});

test('conditions and limits come from the Research: merges suspend, stale quotes and few tests limit confidence', () => {
  const luzibra = projectionFor(dataset, summary('Luzibra'), last('Luzibra')).sell;
  assert.deepEqual([luzibra.points.map(p => p.day), luzibra.suspendedFrom, luzibra.end], [['2026-10-12', '2026-10-19'], '2026-10-26', '2026-10-19']);
  assert.deepEqual(luzibra.limits, ['announced merge, not before 2026-10-22', 'stale quote']);
  const cantabra = projectionFor(dataset, summary('Cantabra'), last('Cantabra')).buy;
  assert.ok(cantabra.available && cantabra.points.every(p => p.condition === 'stale'));
  assert.deepEqual([cantabra.anchor.day, cantabra.limits], ['2026-09-02', ['stale quote']]);
  const floribra = projectionFor(dataset, summary('Floribra'), last('Floribra')).sell;
  assert.deepEqual([floribra.confidence, floribra.limits], ['limited', ['4 transfer tests, fewer than ten']]);
  assert.deepEqual(limits({testN: 1, stale: false, mergerDate: null}), ['1 transfer test, fewer than ten']);
  assert.equal(CONDITIONS.crossed, 'Conditional: crossed sides');
});

test('a day after the anchor reads the projected week that holds it, never an interpolation', () => {
  const p = projectionFor(dataset, summary('Antica'), last('Antica')).sell;
  assert.equal(weekOf(p, '2026-10-04'), null, 'the anchor day is an observation');
  assert.equal(weekOf(p, '2026-10-05'), null, 'the Research cutoff day opens no week');
  assert.equal(weekOf(p, '2026-10-06').day, '2026-10-12');
  assert.equal(weekOf(p, '2026-10-12').day, '2026-10-12');
  assert.equal(weekOf(p, '2026-10-13').day, '2026-10-19');
  assert.equal(weekOf(p, '2027-10-05'), null, 'past the horizon');
  const luzibra = projectionFor(dataset, summary('Luzibra'), last('Luzibra')).sell;
  assert.equal(weekOf(luzibra, '2026-10-21'), null, 'suspended weeks have no value');
});

test('the window ahead matches the range behind, up to the horizon; the axis is every day', () => {
  const p = projectionFor(dataset, summary('Antica'), last('Antica')).sell;
  assert.equal(forwardDays(p, 30), 30);
  assert.equal(forwardDays(p, 365), 365);
  assert.equal(forwardDays(p, 2000), 365, 'never past the scenario');
  assert.equal(forwardDays(p, 2), 7, 'at least one week');
  assert.equal(forwardEnd(p, 91), '2027-01-03');
  const luzibra = projectionFor(dataset, summary('Luzibra'), last('Luzibra')).sell;
  assert.equal(forwardEnd(luzibra, 365), '2026-10-19');
  const days = axisDays(p);
  assert.deepEqual([days[0], days.at(-1), days.length], ['2026-10-05', '2027-10-04', 365]);
  assert.deepEqual(axisDays({available: false}), []);
});

test('an exported image names the scenario, its start, the band\'s nature and what it shows', () => {
  const p = projectionFor(dataset, summary('Antica'), last('Antica')).sell;
  const full = exportLines(p, {fmt, world: 'Antica', side: 'Best Sell Offer'});
  assert.match(full.lines[0].text, /^Projection, Research offer scenario \(C\+S\+H ensemble\), weekly, 52 weeks to 2027-10-04: starts at the Best Sell Offer of 2026-10-04, 43,255; central 45,752 on 2027-10-04\.$/);
  assert.match(full.lines[1].text, /^Heuristic stress band, not a confidence interval: 41,359 to 50,612 on 2027-10-04\. Limited confidence: stale quote\. Conditional: stale quote\.$/);
  const part = exportLines(p, {fmt, world: 'Antica', side: 'Best Sell Offer', through: '2027-01-05'});
  assert.match(part.lines[0].text, /shown to 2027-01-04 of 52 weeks to 2027-10-04/);
  assert.match(part.lines[1].text, /on 2027-01-04\. Limited confidence: stale quote\. Conditional: stale quote\.$/);
  const luzibra = exportLines(projectionFor(dataset, summary('Luzibra'), last('Luzibra')).sell, {fmt, world: 'Luzibra', side: 'Best Sell Offer'});
  assert.match(luzibra.lines[1].text, /Limited confidence: announced merge, not before 2026-10-22; stale quote\. Conditional: stale quote\. Suspended from 2026-10-26\.$/);
  const none = exportLines(projectionFor(dataset, summary('Aethera'), last('Aethera')).sell, {fmt, world: 'Aethera'});
  assert.deepEqual(none.lines.map(l => l.mark), ['none']);
  assert.match(none.lines[0].text, /^Projection unavailable for Aethera: /);
  assert.deepEqual(['dashed', 'band'], full.lines.map(l => l.mark));
});
