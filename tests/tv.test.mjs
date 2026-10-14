// The TradingView pieces that compute without a page: indicators (js/tv-indicators.js), the heatmap's squarified
// layout and colour steps (js/tv-overview.js) and the drawing tools' TradingView defaults (js/tv-drawings.js).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sma, ema, bollinger, rsi, INDICATORS} from '../js/tv-indicators.js';
import {squarify, heatColor} from '../js/tv-overview.js';
import {TOOLS, FIB_LEVELS} from '../js/tv-drawings.js';

const series = values => values.map((value, i) => ({time: `2026-01-${String(i + 1).padStart(2, '0')}`, value}));
const close = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

test('moving averages: a simple mean of the last n values, and an exponential one seeded by it', () => {
  const v = series([1, 2, 3, 4, 5, 6]);
  assert.deepEqual(sma(v, 3).map(p => p.value), [2, 3, 4, 5]);
  assert.equal(sma(v, 3)[0].time, '2026-01-03', 'the first average stands on its last value');
  const e = ema(v, 3), k = 2 / 4;
  assert.equal(e[0].value, 2, 'seeded with the simple mean');
  assert.ok(close(e[1].value, 4 * k + 2 * (1 - k)));
  assert.equal(sma(v, 10).length, 0, 'too few values: no average');
});

test('Bollinger Bands: the mean plus and minus the population deviation times the multiplier', () => {
  const {basis, upper, lower} = bollinger(series([2, 4, 4, 4, 5, 5, 7, 9]), 8, 2);
  assert.equal(basis[0].value, 5);
  assert.equal(upper[0].value, 9, 'deviation 2');
  assert.equal(lower[0].value, 1);
});

test("RSI: Wilder's smoothing, 100 without losses, reproducing the classic worked example", () => {
  const closes = [44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.10, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28, 46.00, 46.03, 46.41, 46.22, 45.64];
  const r = rsi(series(closes), 14).map(p => p.value);
  assert.ok(Math.abs(r[0] - 70.46) < 0.01, `first value ${r[0]}`);
  assert.ok(Math.abs(r.at(-1) - 57.92) < 0.01, `last value ${r.at(-1)}`);
  assert.deepEqual(rsi(series([1, 2, 3, 4, 5]), 3).map(p => p.value), [100, 100]);
  for (const id of ['sma', 'ema', 'bb', 'rsi']) assert.ok(INDICATORS[id].name && INDICATORS[id].short);
});

test('heatmap: the squarified tiles fill the box exactly, each in proportion to its weight', () => {
  const items = [6, 6, 4, 3, 2, 2, 1].map((weight, i) => ({name: `w${i}`, weight}));
  const tiles = squarify(items, 600, 400);
  assert.equal(tiles.length, items.length);
  const area = tiles.reduce((a, t) => a + t.w * t.h, 0);
  assert.ok(close(area, 600 * 400, 1e-6));
  for (const t of tiles) {
    assert.ok(close(t.w * t.h, t.weight / 24 * 600 * 400, 1e-6), `${t.name} in proportion`);
    assert.ok(t.x >= -1e-9 && t.y >= -1e-9 && t.x + t.w <= 600 + 1e-6 && t.y + t.h <= 400 + 1e-6, `${t.name} inside`);
  }
  // No two tiles overlap.
  for (const a of tiles) for (const b of tiles) if (a !== b)
    assert.ok(a.x + a.w <= b.x + 1e-6 || b.x + b.w <= a.x + 1e-6 || a.y + a.h <= b.y + 1e-6 || b.y + b.h <= a.y + 1e-6, `${a.name} and ${b.name}`);
  assert.deepEqual(squarify([{name: 'none', weight: 0}], 100, 100), []);
});

test("heatmap colours: TradingView's seven steps, grey around no change, a darker grey where there is none", () => {
  const steps = [0.01, 0.03, 0.06];
  assert.deepEqual([-0.1, -0.04, -0.02, 0, 0.02, 0.04, 0.1].map(r => heatColor(r, steps)),
    ['#f23645', '#f7525f', '#f77c80', '#8c8c8c', '#42bda8', '#22ab94', '#089981']);
  assert.equal(heatColor(null, steps), '#707070');
});

test("drawing tools carry TradingView's Fibonacci levels and colours", () => {
  assert.deepEqual(FIB_LEVELS.map(l => l[0]), [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.618, 2.618, 3.618, 4.236]);
  assert.equal(FIB_LEVELS.find(l => l[0] === 0.618)[1], '#089981');
  assert.deepEqual(Object.keys(TOOLS), ['trend', 'ray', 'hline', 'hray', 'vline', 'crossline', 'channel', 'fib', 'rect', 'measure', 'text', 'arrowup']);
  assert.equal(TOOLS.channel.points, 3);
});
