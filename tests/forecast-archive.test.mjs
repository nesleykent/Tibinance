// The projections builder never replaces a published representation unless the forecast archive recorded it first.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const root = new URL('..', import.meta.url);
const file = new URL('data/market-projections/tibia-coin.json', root);
const digest = () => createHash('sha256').update(readFileSync(file)).digest('hex');

test('when archiving fails, the projections file is left exactly as it was', () => {
  const before = digest();
  // A Python that always fails stands in for any archive failure (missing interpreter, broken chain, full disk).
  const r = spawnSync(process.execPath, ['tools/build_market_projections.mjs'], { cwd: root, env: { ...process.env, PYTHON: 'false' }, encoding: 'utf8' });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /projections were not replaced/);
  assert.equal(digest(), before);
  assert.ok(!existsSync(new URL('data/market-projections/tibia-coin.json.pending', root)));
});

// ---- js/forecast-archive.js: lifecycle, as-of views, same-target comparison, accuracy -------------------------
import { gzipSync } from 'node:zlib';
import { weekEnding, publishedAt, classify, lifecycleLabel, publishedBy, editionAsOf, endOfDay, scenarioSeries, sameTarget,
  evaluationPoints, metrics, groupMetrics, readObject } from '../js/forecast-archive.js';

const forecast = (hash, { web, repo, state = 'published', provenance = 'authentic', superseded = false, edition = hash, version = 'v1' } = {}) => ({
  contentHash: hash, product: 'tc-world-scenarios', edition, provenance, state, superseded, model: { version },
  evidenceLevel: web ? 'website' : repo ? 'repository' : null,
  evidence: { website: web ? { at: web, basis: 'github-pages-deployment-success' } : null, repository: repo ? { at: repo, basis: 'github-push-event' } : null },
});

test('the target week is the Monday to Sunday week holding the date, labelled by its Sunday', () => {
  assert.equal(weekEnding('2026-10-12'), '2026-10-18');
  assert.equal(weekEnding('2026-10-18'), '2026-10-18');
  assert.equal(weekEnding('2026-10-19'), '2026-10-25');
});

test('publication needs evidence: website first, repository only as a labelled fallback, archived never', () => {
  assert.deepEqual(publishedAt(forecast('a', { web: '2026-10-02T07:29:36Z', repo: '2026-10-02T07:29:12Z' })), { at: '2026-10-02T07:29:36Z', level: 'website', basis: 'github-pages-deployment-success', fallback: false });
  assert.equal(publishedAt(forecast('b', { repo: '2026-10-02T07:29:12Z' })).fallback, true);
  assert.equal(publishedAt(forecast('b', { repo: '2026-10-02T07:29:12Z' }), { fallback: false }), null);
  assert.equal(publishedAt(forecast('c', { state: 'archived' })), null);
  assert.equal(classify(forecast('c', { state: 'archived' })), 'archived-unpublished');
  assert.equal(classify(forecast('d', { provenance: 'backtest' })), 'backtest');
  assert.match(lifecycleLabel(forecast('e', { web: 'x', superseded: true })), /superseded/);
  assert.match(lifecycleLabel(forecast('f', { state: 'publication-failed' })), /publication failed/);
});

test('an as-of view shows only what was public by then, the latest publication first, never later revisions', () => {
  const index = { forecasts: [
    forecast('sep28', { web: '2026-10-01T21:16:22Z' }),
    forecast('oct02a', { web: '2026-10-02T07:29:36Z', superseded: true }),
    forecast('oct02b', { web: '2026-10-02T15:39:44Z' }),
    forecast('unpublished', { state: 'archived' }),
    forecast('bt', { web: '2026-10-01T00:00:00Z', provenance: 'backtest' }),
  ] };
  assert.equal(editionAsOf(index, endOfDay('2026-09-30')), null);
  assert.equal(editionAsOf(index, endOfDay('2026-10-01')).forecast.contentHash, 'sep28');
  // On 2 October before the revision the original edition was the one shown; by the end of the day the revision.
  assert.equal(editionAsOf(index, '2026-10-02T12:00:00Z').forecast.contentHash, 'oct02a');
  assert.equal(editionAsOf(index, endOfDay('2026-10-02')).forecast.contentHash, 'oct02b');
  assert.deepEqual(publishedBy(index, endOfDay('2026-10-13')).map(x => x.forecast.contentHash), ['oct02b', 'oct02a', 'sep28']);
});

const outputs = base => ({ worldPaths: ['2026-10-12', '2026-10-19', '2026-10-26'].flatMap((date, j) => ['ask', 'bid'].map(side => ({
  world: 'Antica', date, side, base: base + j + (side === 'bid' ? -1 : 0), low: base - 5, high: base + 5, status: 'Cenário de ofertas' }))) });

test('one world and side of an edition, and the forecasts of several editions for the same target week', () => {
  assert.deepEqual(scenarioSeries(outputs(100), 'Antica', 'ask').map(p => [p.target, p.week, p.base]), [['2026-10-12', '2026-10-18', 100], ['2026-10-19', '2026-10-25', 101], ['2026-10-26', '2026-11-01', 102]]);
  const editions = [
    { forecast: { edition: 'late', contentHash: 'b' }, publication: { at: '2026-10-12T00:00:00Z', level: 'website' }, outputs: { worldPaths: outputs(200).worldPaths.map(x => ({ ...x, date: x.date === '2026-10-12' ? '2026-10-19' : x.date === '2026-10-19' ? '2026-10-26' : '2026-11-02' })) } },
    { forecast: { edition: 'early', contentHash: 'a' }, publication: { at: '2026-10-05T00:00:00Z', level: 'website' }, outputs: outputs(100) },
  ];
  const same = sameTarget(editions, 'Antica', 'ask', '2026-10-25');
  assert.deepEqual(same.map(x => [x.edition, x.horizon, x.base]), [['early', 2, 101], ['late', 1, 200]]);
});

test('accuracy: errors, bias, interval coverage, a zero actual, groups, and superseded evaluations out of view', () => {
  const m = metrics([{ actual: 100, predicted: 110, inside: true }, { actual: 200, predicted: 190, inside: false }, { actual: 0, predicted: 5, inside: null }]);
  assert.equal(m.n, 3);
  assert.equal(m.mae, (10 + 10 + 5) / 3);
  assert.equal(m.mape, (10 + 5) / 2);
  assert.ok(Math.abs(m.bias - (10 - 5) / 2) < 1e-9);
  assert.equal(m.coverage, 0.5);
  assert.equal(m.intervals, 2);
  assert.equal(metrics([]).mape, null);
  const index = { forecasts: [forecast('f1', { web: 'x', version: 'v1' }), forecast('f2', { state: 'archived', version: 'v2' })] };
  const line = (type, f, week, items, extra = {}) => JSON.stringify({ type, forecast: f, weekEnding: week, observation: { cutoff: '2026-10-20' }, items, ...extra });
  const jsonl = [
    line('evaluation', 'f1', '2026-10-18', [{ world: 'Antica', side: 'ask', horizon: 1, actual: 100, predicted: 120, inside: false }]),
    line('evaluation-superseded', 'f1', '2026-10-18', []),
    line('evaluation', 'f1', '2026-10-18', [{ world: 'Antica', side: 'ask', horizon: 1, actual: 110, predicted: 120, inside: true }]),
    line('evaluation', 'f2', '2026-10-18', [{ world: 'Antica', side: 'ask', horizon: 2, actual: 110, predicted: 100, inside: true }]),
  ].join('\n');
  const points = evaluationPoints(jsonl, index);
  assert.deepEqual(points.map(p => [p.forecast, p.actual, p.class]), [['f1', 110, 'published-website'], ['f2', 110, 'archived-unpublished']]);
  assert.deepEqual(groupMetrics(points, p => p.class).map(g => [g.key, g.n]), [['archived-unpublished', 1], ['published-website', 1]]);
  assert.deepEqual(groupMetrics(points, p => p.horizon).map(g => g.key), [1, 2]);
});

test('archive objects decompress in the browser path', async () => {
  const value = { worldPaths: [{ a: 1 }] };
  assert.deepEqual(await readObject(gzipSync(JSON.stringify(value))), value);
});
