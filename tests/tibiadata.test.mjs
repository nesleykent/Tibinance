import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lookupWorld } from '../js/tibiadata.js';

// TibiaData v5 sends CORS headers on errors, so the browser sees real statuses:
// 404 means the character does not exist, 502 means tibia.com was unreachable.
async function withFetch(impl, run) {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  try { return await run(); } finally { globalThis.fetch = original; }
}

const respond = (status, body = {}) => async () => new Response(JSON.stringify(body), { status });

test('lookupWorld reads the character world from the v5 endpoint', async () => {
  const urls = [];
  const world = await withFetch(async url => { urls.push(String(url)); return respond(200, { character: { character: { world: 'Antica' } } })(); },
    () => lookupWorld('Some Name'));
  assert.equal(world, 'Antica');
  assert.deepEqual(urls, ['https://api.tibiadata.com/v5/character/Some%20Name']);
});

test('a 404 is reported as an unknown character', async () => {
  await withFetch(respond(404, { information: { status: { http_code: 404, error: 20001 } } }), () =>
    assert.rejects(lookupWorld('Nobody'), /404; the character name is most likely misspelled or does not exist/));
});

test('a 502 is reported as an upstream outage, not a bad name', async () => {
  await withFetch(respond(502), () =>
    assert.rejects(lookupWorld('Anyone'), /502; tibia\.com could not be reached/));
});

test('a network failure is reported as unreachable', async () => {
  await withFetch(async () => { throw new TypeError('Failed to fetch'); }, () =>
    assert.rejects(lookupWorld('Anyone'), /could not be reached; check that you are online/));
});
