// Incremental TibiaMarket synchronisation: refresh only the worlds whose history grew since our copies.
//
//   node tools/sync_tibiamarket.mjs           fetch what changed and write the Markets copies
//   node tools/sync_tibiamarket.mjs --dry     report what would be fetched
//
// One request (world_data) gives every world's last update; a world is fetched only when that is newer than the
// newest row of every copy we hold (the Research's frozen copies in reports/tc-cycle/inputs/api/ and the Markets
// copies in data/market-history/inputs/tibiamarket/). The fetch is the same full-history request, spacing and
// back-off as tools/fetch_market_history.mjs, and is stored in the same format (gzipped as received, manifest with
// URL, retrieval time, rows and SHA-256), so tools/build_market_history.mjs reads it unchanged.
//
// A new copy replaces the Markets copy only if it contains every row we already hold, byte-identical as parsed:
// TibiaMarket rows never disappear or change silently here. A copy that dropped or altered a row is not written;
// the conflict is reported (and recorded in data/economy/sync-status.json by the caller) for review. Research
// copies are never written. Screenshot captures and manual observations are other inputs, never touched here.
import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { ASSETS } from '../js/market-history.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const HISTORY = join(ROOT, 'data/market-history/inputs/tibiamarket');
const RESEARCH = join(ROOT, 'reports/tc-cycle/inputs/api');
const API = 'https://api.tibiamarket.top';
const SPACING = 12000, BACKOFF = 35000;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const canonicalRow = r => JSON.stringify(Object.keys(r).sort().map(k => [k, r[k]]));

export async function get(url, fetchImpl = fetch) {
  for (let attempt = 0; attempt < 4; attempt++) {
    await sleep(attempt ? SPACING : 0);
    const response = await fetchImpl(url, { headers: { Accept: 'application/json' } });
    if (response.status === 429) { await sleep(Math.max(Number(response.headers.get('retry-after') ?? 0) * 1000, BACKOFF)); continue; }
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  }
  throw new Error(`${url}: still rate limited`);
}

// Every row we hold for a world, from every copy, keyed by timestamp.
export async function heldRows(world) {
  const rows = new Map();
  const add = list => { for (const r of list) rows.set(r.time, r); };
  const lower = world.toLowerCase();
  try { add(JSON.parse(await readFile(join(RESEARCH, `${lower}.json`), 'utf8'))); } catch {}
  try { add(JSON.parse(gunzipSync(await readFile(join(HISTORY, `${lower}.json.gz`))))); } catch {}
  return rows;
}

// Whether a new copy keeps every held row unchanged; returns the rows it lost or changed.
export function missingFrom(held, fresh) {
  const byTime = new Map(fresh.map(r => [r.time, r]));
  const problems = [];
  for (const [time, row] of held) {
    const now = byTime.get(time);
    if (!now) problems.push(`${time}: dropped`);
    else if (canonicalRow(now) !== canonicalRow(row)) problems.push(`${time}: changed`);
  }
  return problems;
}

export async function plan(worldData, worlds = null) {
  const out = [];
  for (const w of worldData) {
    if (worlds && !worlds.has(w.name)) continue;
    const held = await heldRows(w.name);
    const newest = Math.max(0, ...held.keys());
    const updated = Date.parse(`${w.last_update}Z`) / 1000;
    if (Number.isFinite(updated) && updated > newest + 1) out.push({ world: w.name, newest, updated, held });
  }
  return out;
}

export async function sync({ dry = false, fetchImpl = fetch, log = console.log } = {}) {
  const worldData = JSON.parse(await get(`${API}/world_data`, fetchImpl));
  const todo = await plan(worldData);
  const manifestPath = join(HISTORY, 'manifest.json');
  const manifest = new Map(JSON.parse(await readFile(manifestPath, 'utf8')).map(m => [m.world, m]));
  const result = { checked: worldData.length, due: todo.map(t => t.world), updated: [], conflicts: [], newRows: 0,
    sourceLatestUpdate: worldData.map(w => w.last_update).filter(Boolean).sort().at(-1) ?? null };
  if (dry) return result;
  for (const [i, t] of todo.entries()) {
    if (i) await sleep(SPACING);
    const url = `${API}/item_history?server=${encodeURIComponent(t.world)}&item_id=${ASSETS['tibia-coin'].tibiaMarketItemId}&start_days_ago=2000&end_days_ago=-1`;
    const raw = await get(url, fetchImpl);
    const rows = JSON.parse(raw);
    if (!Array.isArray(rows)) throw new Error(`${t.world}: unexpected response`);
    const problems = missingFrom(t.held, rows);
    if (problems.length) {
      result.conflicts.push({ world: t.world, problems: problems.slice(0, 10), count: problems.length });
      log(`${t.world}: not written, the new copy dropped or changed ${problems.length} held rows`);
      continue;
    }
    const added = rows.filter(r => !t.held.has(r.time)).length;
    if (!added) continue;
    await writeFile(join(HISTORY, `${t.world.toLowerCase()}.json.gz`), gzipSync(raw, { level: 9 }));
    manifest.set(t.world, { world: t.world, url, retrievedAt: new Date().toISOString(), rows: rows.length, sha256: createHash('sha256').update(raw).digest('hex') });
    result.updated.push(t.world);
    result.newRows += added;
    log(`${t.world}: ${added} new rows`);
  }
  if (result.updated.length) await writeFile(manifestPath, JSON.stringify([...manifest.values()].sort((a, b) => a.world.localeCompare(b.world)), null, 1) + '\n');
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = await sync({ dry: process.argv.includes('--dry') });
  console.log(JSON.stringify(r));
  if (r.conflicts.length) process.exitCode = 2;
}
