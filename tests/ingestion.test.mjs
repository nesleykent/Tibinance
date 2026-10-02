import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ingestScreenshot, prepareCapture, STAGES } from '../js/ingestion.js';
import { acceptsScreenshotName } from '../js/filename.js';
import { toRecord } from '../js/store.js';

const source = type => ({ name: ['2026-10-01', '120000123', 'Synthetic Character', type].join('_') + '.webp' });
const hash = 'a'.repeat(64);
const rows = () => ({
  sell: [{ amount: 100, price: 50000, total: 5000000, endsAt: '2026-10-31T12:00:00' }],
  buy: [{ amount: 100, price: 40000, total: 4000000, endsAt: '2026-10-31T12:00:00' }], warnings: [], notices: []
});
function harness(overrides = {}) {
  const calls = [];
  const wrap = (key, fn) => async (...args) => { calls.push(key); return fn(...args); };
  return { calls, services: {
    sha256: wrap('hash', () => hash),
    createBitmap: wrap('decode', () => ({ close: () => calls.push('close') })),
    verifyMarket: wrap('market', () => ({})),
    verifyTibiaCoins: wrap('item', () => ({ status: 'tibia_coins' })),
    lookupWorld: wrap('characterAPI', () => 'Antica'),
    worldInfo: wrap('worldAPI', () => ({ world: 'Antica', type: 'Open PvP', battleye: 'Yellow' })),
    extractMarketStatistics: wrap('statistics', () => ({buy:{transactions:10,highestPrice:45000,averagePrice:42000,lowestPrice:40000},sell:{transactions:20,highestPrice:55000,averagePrice:52000,lowestPrice:50000}})),
    extractMarketOffers: wrap('extract', rows), ...overrides
  } };
}

test('original filename gate precedes hashing, decoding and every downstream stage', async () => {
  const h = harness();
  assert.equal(acceptsScreenshotName(source('Hotkey').name), true);
  for (const type of ['Death', 'LevelUp', 'SkillUp', 'hotkey']) {
    const r = await ingestScreenshot(source(type), {}, h.services);
    assert.equal(r.status, 'excluded_automatic');
    assert.deepEqual(r.attemptedStages, ['filename']);
  }
  assert.deepEqual(h.calls, []);
});

test('hash duplicate gate stops before image decoding, API and extraction', async () => {
  for (const options of [{ getExisting: async () => ({ world: 'Antica' }) }, { isQueued: async () => true }]) {
    const h = harness();
    const r = await ingestScreenshot(source('Hotkey'), options, h.services);
    assert.equal(r.status, 'duplicate');
    assert.deepEqual(r.attemptedStages, ['filename', 'deduplication']);
    assert.deepEqual(h.calls, ['hash']);
  }
});

test('Market and item failures stop before metadata, API and offer extraction', async () => {
  for (const [gate, code, expected] of [['verifyMarket', null, 'excluded_market'],
    ['verifyTibiaCoins', 'other_item', 'excluded_other_item'], ['verifyTibiaCoins', null, 'unclassifiable']]) {
    let metadataReads = 0;
    const h = harness({ [gate]: async () => { throw Object.assign(new Error('private marker'), { code }); },
      parseFilename: () => { metadataReads++; throw new Error(); } });
    const r = await ingestScreenshot(source('Hotkey'), {}, h.services);
    assert.equal(r.status, expected);
    assert.equal(metadataReads, 0);
    assert.ok(!h.calls.includes('characterAPI') && !h.calls.includes('extract'));
    assert.ok(!JSON.stringify(r).includes('private marker'));
    assert.equal(h.calls.at(-1), 'close');
  }
});

test('world resolution finishes before offer extraction and a failed lookup stops it', async () => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const h = harness({ lookupWorld: async () => { h.calls.push('characterAPI'); return pending; } });
  const work = ingestScreenshot(source('Hotkey'), {}, h.services);
  while (!h.calls.includes('characterAPI')) await new Promise(resolve => setTimeout(resolve, 0));
  assert.ok(!h.calls.includes('extract'));
  release('Antica');
  const r = await work;
  assert.equal(r.status, 'ready');
  assert.deepEqual(r.attemptedStages, STAGES.filter(s => s !== 'statistics'));
  assert.deepEqual(h.calls, ['hash', 'decode', 'market', 'item', 'characterAPI', 'worldAPI', 'extract', 'close']);
  assert.ok(!JSON.stringify(r).includes('Synthetic Character'));
  assert.ok(!JSON.stringify(r).includes(source('Hotkey').name));
  const failed = harness({ lookupWorld: async () => { throw new Error('private marker'); } });
  const bad = await ingestScreenshot(source('Hotkey'), {}, failed.services);
  assert.equal(bad.status, 'needs_review');
  assert.equal(bad.stages.world, false);
  assert.ok(!failed.calls.includes('extract'));
  assert.ok(!JSON.stringify(bad).includes('private marker'));
});

test('explicit historical reprocessing preserves context after eligibility and skips live API', async () => {
  const h = harness();
  const r = await ingestScreenshot(source('Hotkey'), { reprocess: true, getExisting: async () => ({
    world: 'Secura', type: 'Optional PvP', battleye: 'Green', capturedAt: '2026-09-01T12:00:00'
  }) }, h.services);
  assert.equal(r.status, 'ready');
  assert.equal(r.capture.world, 'Secura');
  assert.equal(r.capture.capturedAt, '2026-09-01T12:00:00');
  assert.ok(h.calls.includes('market') && h.calls.includes('item') && h.calls.includes('extract'));
  assert.ok(!h.calls.includes('characterAPI'));
});

test('invalid observations cannot produce a persistable canonical capture', async () => {
  const invalid = rows(); invalid.sell[0].total = 1;
  const h = harness({ extractMarketOffers: async () => invalid });
  const r = await ingestScreenshot(source('Hotkey'), {}, h.services);
  assert.equal(r.status, 'needs_review');
  assert.equal(r.capture, undefined);
  assert.throws(() => prepareCapture(r), /validation/);
  r.rows.sell[0].total = 5000000;
  const corrected = prepareCapture(r);
  assert.equal(corrected.offers.length, 2);
  assert.equal(corrected.offers[0].total, 5000000);
});

test('invalid calendar metadata and manual corrections cannot bypass gates', async () => {
  const h = harness();
  const invalid = source('Hotkey'); invalid.name = invalid.name.replace('2026-10-01', '2026-02-31');
  const r = await ingestScreenshot(invalid, {}, h.services);
  assert.equal(r.stages.metadata, false);
  assert.ok(!h.calls.includes('characterAPI') && !h.calls.includes('extract'));
  const item = harness({ verifyTibiaCoins: async () => { throw new Error(); } });
  const corrected = await ingestScreenshot(source('Hotkey'), { correction: { offers: [] } }, item.services);
  assert.equal(corrected.stages.item, false);
  assert.ok(!item.calls.includes('extract'));
});

test('simultaneous identical uploads reserve the first hash before storage lookup', async () => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const states = [{}, {}];
  const first = harness({ lookupWorld: async () => pending });
  const second = harness();
  const options = i => ({ onHash: value => { states[i].hash = value; },
    getExisting: async () => null,
    isQueued: value => states.some((state, index) => index !== i && state.hash === value) });
  const started = ingestScreenshot(source('Hotkey'), options(0), first.services);
  while (!states[0].hash) await new Promise(resolve => setTimeout(resolve, 0));
  const duplicate = await ingestScreenshot(source('Hotkey'), options(1), second.services);
  assert.equal(duplicate.status, 'duplicate');
  assert.deepEqual(second.calls, ['hash']);
  release('Antica');
  assert.equal((await started).status, 'ready');
});

test('concurrent eligible images cannot interleave the shared OCR worker', async () => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const first = harness({ lookupWorld: async () => pending });
  const second = harness({ sha256: async () => 'b'.repeat(64) });
  const work = ingestScreenshot(source('Hotkey'), {}, first.services);
  while (!first.calls.includes('item')) await new Promise(resolve => setTimeout(resolve, 0));
  const next = ingestScreenshot(source('Hotkey'), {}, second.services);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(second.calls, []);
  release('Antica');
  assert.equal((await work).status, 'ready');
  assert.equal((await next).status, 'ready');
});

test('canonical storage enforces the same validation and computed totals', async () => {
  const h = harness();
  const result = await ingestScreenshot(source('Hotkey'), {}, h.services);
  assert.equal(toRecord(result.capture).offers.length, 2);
  for (const mutate of [c => { c.capturedAt = 'invalid'; }, c => { c.offers[0].total = 1; },
    c => { c.offers[0].endsAt = 'invalid'; }, c => { c.sellVolume = 1; }]) {
    const broken = structuredClone(result.capture); mutate(broken);
    assert.throws(() => toRecord(broken), /Canonical/);
  }
});
