// Freezes the extra inputs of the Markets dataset under data/market-history/inputs/.
// The research inputs (reports/tc-cycle/inputs/api/) are never read for writing or changed.
//
//   node tools/fetch_market_history.mjs                     fetch every tracked world not frozen yet
//   node tools/fetch_market_history.mjs --refresh=Antica    also refetch these worlds' histories
//   node tools/fetch_market_history.mjs --worlds            also refresh the TibiaData world snapshot
//
// Histories are TibiaMarket.top item_history for Tibia Coins, stored gzipped as received, one
// file per world, with a manifest of URL, retrieval time, row count and SHA-256 of the raw JSON.
// Requests are spaced and back off on HTTP 429 exactly as reports/tc-cycle/fetch_api.py does.
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { ASSETS } from '../js/market-history.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const INPUTS = join(ROOT, 'data/market-history/inputs');
const HISTORY = join(INPUTS, 'tibiamarket');
const RESEARCH = join(ROOT, 'reports/tc-cycle/inputs/api');
const SPACING = 12000, BACKOFF = 35000;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function get(url) {
  for (let attempt = 0; attempt < 4; attempt++) {
    await sleep(SPACING);
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (response.status === 429) { await sleep(Math.max(Number(response.headers.get('retry-after') ?? 0) * 1000, BACKOFF)); continue; }
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  }
  throw new Error(`${url}: still rate limited`);
}

const readJson = async (path, fallback) => JSON.parse(await readFile(path, 'utf8').catch(() => JSON.stringify(fallback)));

async function main() {
  const args = process.argv.slice(2);
  const refresh = new Set((args.find(a => a.startsWith('--refresh='))?.slice(10) ?? '').split(',').filter(Boolean));
  await mkdir(HISTORY, { recursive: true });

  if (args.includes('--worlds')) {
    const body = JSON.parse(await get('https://api.tibiadata.com/v4/worlds'));
    const worlds = body.worlds.regular_worlds.map(w => ({ name: w.name, location: w.location, pvp_type: w.pvp_type,
      battleye_protected: w.battleye_protected, battleye_date: w.battleye_date, premium_only: w.premium_only,
      transfer_type: w.transfer_type, game_world_type: w.game_world_type })).sort((a, b) => a.name.localeCompare(b.name));
    await writeFile(join(INPUTS, 'worlds.json'), JSON.stringify({ source: 'https://api.tibiadata.com/v4/worlds',
      retrievedAt: body.information.timestamp, worlds }, null, 1) + '\n');
    console.log(`world snapshot: ${worlds.length} worlds at ${body.information.timestamp}`);
  }

  const tracked = JSON.parse(await get('https://api.tibiamarket.top/world_data')).map(w => w.name);
  const research = new Set((await readdir(RESEARCH)).filter(f => f !== 'manifest.json').map(f => f.slice(0, -5)));
  const manifest = new Map((await readJson(join(HISTORY, 'manifest.json'), [])).map(m => [m.world, m]));
  const todo = tracked.filter(w => refresh.has(w) || (!research.has(w.toLowerCase()) && !manifest.has(w))).sort();
  for (const [i, world] of todo.entries()) {
    const url = `https://api.tibiamarket.top/item_history?server=${encodeURIComponent(world)}&item_id=${ASSETS['tibia-coin'].tibiaMarketItemId}&start_days_ago=2000&end_days_ago=-1`;
    const raw = await get(url);
    const rows = JSON.parse(raw);
    if (!Array.isArray(rows)) throw new Error(`${world}: unexpected response`);
    await writeFile(join(HISTORY, `${world.toLowerCase()}.json.gz`), gzipSync(raw, { level: 9 }));
    manifest.set(world, { world, url, retrievedAt: new Date().toISOString(), rows: rows.length,
      sha256: createHash('sha256').update(raw).digest('hex') });
    await writeFile(join(HISTORY, 'manifest.json'), JSON.stringify([...manifest.values()].sort((a, b) => a.world.localeCompare(b.world)), null, 1) + '\n');
    console.log(`${i + 1}/${todo.length} ${world} ${rows.length}`);
  }
}

await main();
