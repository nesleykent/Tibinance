import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createConfig, config, ENV_KEYS } from '../js/config.js';

test('public defaults preserve existing URLs, durations and views and are immutable', () => {
  assert.deepEqual(config, {
    apiBaseUrl: 'https://api.tibiadata.com/v5', worldsCacheMs: 21600000, onlineRefreshMs: 300000,
    downloadRevokeMs: 10000, announcementDelayMs: 700, defaultWorld: 'Antica',
    marketRange: '1Y', economyRange: 'All', staleDays: 7
  });
  assert.ok(Object.isFrozen(config));
  assert.throws(() => { config.defaultWorld = 'Secura'; }, TypeError);
});

test('validated deployment values normalize URLs and retain units', () => {
  const c = createConfig({ TIBINANCE_API_BASE_URL: ' https://api.example.test/custom/v4/// ',
    TIBINANCE_ONLINE_REFRESH_MS: '60000', TIBINANCE_DEFAULT_WORLD: 'Secura',
    TIBINANCE_MARKET_RANGE: '3M', TIBINANCE_ECONOMY_RANGE: '1Y', TIBINANCE_STALE_DAYS: '14' });
  assert.equal(c.apiBaseUrl, 'https://api.example.test/custom/v4');
  assert.equal(c.onlineRefreshMs, 60000);
  assert.equal(c.defaultWorld, 'Secura');
  assert.equal(c.marketRange, '3M');
  assert.equal(c.economyRange, '1Y');
  assert.equal(c.staleDays, 14);
});

test('invalid public URLs cannot leak credentials or use executable schemes', () => {
  for (const value of ['relative', 'http://example.test', 'javascript:alert(1)', 'https://user:secret@example.test', 'https://example.test/?key=secret', 'https://example.test/#secret']) {
    assert.throws(() => createConfig({ TIBINANCE_API_BASE_URL: value }), /TIBINANCE_API_BASE_URL/);
  }
});

test('durations and limits reject malformed, fractional, infinite, negative and excessive values', () => {
  for (const key of ENV_KEYS.filter(k => k.endsWith('_MS') || k.endsWith('_DAYS'))) {
    for (const value of ['0', '-1', '1.5', '1e3', 'NaN', 'Infinity', '9007199254740992', {}, null]) {
      assert.throws(() => createConfig({ [key]: value }), new RegExp(key));
    }
  }
  assert.throws(() => createConfig({ TIBINANCE_DOWNLOAD_REVOKE_MS: '60001' }), /REVOKE_MS/);
});

test('defaults apply only to absent or empty values, and view choices are constrained', () => {
  assert.equal(createConfig({ TIBINANCE_DEFAULT_WORLD: '' }).defaultWorld, 'Antica');
  for (const value of [' ', '<script>', '../Antica']) assert.throws(() => createConfig({ TIBINANCE_DEFAULT_WORLD: value }), /DEFAULT_WORLD/);
  for (const key of ['TIBINANCE_MARKET_RANGE', 'TIBINANCE_ECONOMY_RANGE']) assert.throws(() => createConfig({ [key]: '5D' }), new RegExp(key));
  assert.deepEqual(createConfig({ GH_TOKEN: 'private', TIBINANCE_API_KEY: 'private' }), config);
  assert.ok(!ENV_KEYS.some(k => /SECRET|TOKEN|PASSWORD|KEY$/.test(k)));
});

test('static env bridge validates before writing and serializes only whitelisted public values', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tibinance-public-config-'));
  for (const folder of ['js', 'tools']) mkdirSync(join(dir, folder));
  writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
  for (const file of ['js/config.js', 'js/public-config.js', 'tools/write_public_config.mjs']) {
    copyFileSync(new URL(`../${file}`, import.meta.url), join(dir, file));
  }
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('TIBINANCE_')));
  const run = settings => spawnSync(process.execPath, ['tools/write_public_config.mjs'], { cwd: dir, env: { ...env, ...settings }, encoding: 'utf8' });
  const ok = run({ TIBINANCE_API_BASE_URL: 'https://api.example.test/v4', TIBINANCE_ONLINE_REFRESH_MS: '60000', GH_TOKEN: 'do-not-serialize', TIBINANCE_API_KEY: 'do-not-serialize' });
  assert.equal(ok.status, 0, ok.stderr);
  const generated = readFileSync(join(dir, 'js/public-config.js'), 'utf8');
  assert.match(generated, /api.example.test/);
  assert.doesNotMatch(generated, /do-not-serialize|GH_TOKEN|API_KEY/);
  const bad = run({ TIBINANCE_ONLINE_REFRESH_MS: '-1' });
  assert.notEqual(bad.status, 0);
  assert.equal(readFileSync(join(dir, 'js/public-config.js'), 'utf8'), generated, 'invalid settings leave the previous deployment intact');
});
