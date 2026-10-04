import {test} from 'node:test';
import assert from 'node:assert/strict';
import {HIDDEN,dayGrid,daysBetween,lineLayers,rangeStart,changeOver,neighbours,RANGES} from '../js/market-series.js';
import {bestOfferCloses} from '../js/market-history.js';

const visible = layer => layer.map(p => p.color !== HIDDEN);

test('solid joins consecutive server days, dotted spans unobserved days, and no point is invented', () => {
  // 2026-01-01, 01-02 consecutive; 01-05 after two unobserved days; 01-06 consecutive; 02-01 after a long gap.
  const points = ['2026-01-01','2026-01-02','2026-01-05','2026-01-06','2026-02-01'].map((time, i) => ({time, value:100 + i}));
  const {solid, dotted} = lineLayers(points);
  // The chart colours the segment leaving a point with that point's colour.
  assert.deepEqual(visible(solid), [true, false, true, false, false]);
  assert.deepEqual(visible(dotted), [false, true, false, true, false]);
  for (const layer of [solid, dotted]) assert.deepEqual(layer.map(({time, value}) => ({time, value})), points);
  // Every segment is drawn by exactly one layer.
  for (let i = 0; i < points.length - 1; i++) assert.equal(visible(solid)[i] + visible(dotted)[i], 1);
  assert.deepEqual(lineLayers([]), {solid:[], dotted:[]});
  assert.deepEqual(visible(lineLayers([points[0]]).solid), [false]);
});

test('the day grid covers every server day, inclusive', () => {
  assert.deepEqual(dayGrid('2024-02-28','2024-03-01'), ['2024-02-28','2024-02-29','2024-03-01']);
  assert.deepEqual(dayGrid('2026-01-01','2026-01-01'), ['2026-01-01']);
  assert.equal(dayGrid('2025-10-25','2025-10-27').length, 3, 'a DST change does not skip or repeat a day');
  assert.equal(daysBetween('2026-09-11','2026-09-21'), 10);
});

test('ranges count calendar months back from the last day and clamp to shorter months', () => {
  assert.deepEqual(RANGES, ['1M','3M','6M','YTD','1Y','All']);
  assert.equal(rangeStart('2026-10-01','1M'), '2026-09-01');
  assert.equal(rangeStart('2026-10-01','3M'), '2026-07-01');
  assert.equal(rangeStart('2026-10-01','6M'), '2026-04-01');
  assert.equal(rangeStart('2026-10-01','YTD'), '2026-01-01');
  assert.equal(rangeStart('2026-10-01','1Y'), '2025-10-01');
  assert.equal(rangeStart('2026-03-31','1M'), '2026-02-28');
  assert.equal(rangeStart('2024-03-31','1M'), '2024-02-29');
  assert.equal(rangeStart('2024-02-29','1Y'), '2023-02-28');
  assert.equal(rangeStart('2026-01-15','1M'), '2025-12-15');
  assert.equal(rangeStart('2026-10-01','All'), null);
  assert.throws(() => rangeStart('2026-10-01','5D'), /Unknown range/);
});

test('change compares with the last observation on or before the range start', () => {
  const closes = [{day:'2026-06-20',value:40000},{day:'2026-07-03',value:41000},{day:'2026-09-30',value:44000},{day:'2026-10-01',value:42000}];
  const c = changeOver(closes, '2026-07-01');
  assert.deepEqual([c.from.day, c.to.day], ['2026-06-20','2026-10-01']);
  assert.equal(c.ratio, 42000 / 40000 - 1);
  assert.equal(changeOver(closes, null).from.day, '2026-06-20', 'All starts at the first observation');
  // A world younger than the range compares with its first observation inside it.
  assert.equal(changeOver(closes.slice(1), '2026-01-01').from.day, '2026-07-03');
  // Nothing to compare: a single observation, or none since the start.
  assert.equal(changeOver(closes.slice(0, 1), null), null);
  assert.equal(changeOver([{day:'2025-10-30',value:41419},{day:'2025-10-31',value:41500}], '2026-07-01'), null);
});

test('a day is located among observed days without inventing one', () => {
  const days = ['2026-09-08','2026-09-11','2026-09-21','2026-09-22'];
  assert.deepEqual(neighbours(days, '2026-09-11'), {at:1, before:0, after:2});
  assert.deepEqual(neighbours(days, '2026-09-15'), {at:-1, before:1, after:2}, 'inside a gap');
  assert.deepEqual(neighbours(days, '2026-09-01'), {at:-1, before:-1, after:0});
  assert.deepEqual(neighbours(days, '2026-10-01'), {at:-1, before:3, after:-1});
  assert.deepEqual(neighbours(days, '2026-09-22'), {at:3, before:2, after:-1});
  assert.deepEqual(neighbours([], '2026-09-22'), {at:-1, before:-1, after:-1});
});

test('each server day keeps its last best offer and counts its observations', () => {
  const observations = [
    {capturedAtUtc:'2026-09-30T12:00:00.000Z', serverDay:'2026-09-30', sell:44000, buy:43000},
    {capturedAtUtc:'2026-10-01T09:00:00.000Z', serverDay:'2026-10-01', statistics30d:{}},
    {capturedAtUtc:'2026-10-01T11:00:00.000Z', serverDay:'2026-10-01', sell:44100, buy:43100},
    {capturedAtUtc:'2026-10-02T03:00:00.000Z', serverDay:'2026-10-01', sell:44200, buy:43200}
  ];
  assert.deepEqual(bestOfferCloses(observations), [
    {serverDay:'2026-09-30', capturedAtUtc:'2026-09-30T12:00:00.000Z', sell:44000, buy:43000, observations:1},
    {serverDay:'2026-10-01', capturedAtUtc:'2026-10-02T03:00:00.000Z', sell:44200, buy:43200, observations:2}
  ]);
});
