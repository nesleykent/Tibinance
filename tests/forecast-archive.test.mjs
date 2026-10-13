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
