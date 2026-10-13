// Kill statistics from the tibiamaps repositories, ingested into compact cached partitions.
//
//   node tools/economy/ingest_killstats.mjs                 incremental: months whose upstream files changed
//   node tools/economy/ingest_killstats.mjs --months 2025-11,2025-12
//   node tools/economy/ingest_killstats.mjs --full          rebuild every month
//
// Sources (never republished): tibiamaps/tibia-kill-stats-from-2022-08-23-to-2025-12-04 (archive) and
// tibiamaps/tibia-kill-stats (current), each data/<world>/<YYYY-MM-DD>.json, TibiaData kill statistics collected
// about 04:00 Europe/Berlin. A file's last_day_* counts one day; seven consecutive files sum to its last_week_*.
//
// Method (Stage C0 benchmark): a shallow, blobless clone of each repository pinned at its HEAD lists every file from
// the tree alone; each month is then checked out in one batched sparse checkout, read, written as one partition per
// world (js/economy-killstats.js) under .cache/economy/killstats/, and removed from the checkout. A month is redone
// only when its upstream files (path and git blob) changed, or its partitions are missing from the cache.
//
// Committed outputs (data/economy/sources/):
//   races.json      the append-only race dictionary (kill-statistics race names), so ids never change meaning
//   killstats.json  pinned upstream commits; per world its dates, missing dates (never filled), dates recovered
//                   exactly from the weekly counter, and per world-month the SHA-256 digest of its source files and
//                   of its partition; per date its availability (the upstream commit that added it); conflicts
// Partitions are a cache: any machine rebuilds them from the pinned commits; their digests prove it got the same.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { packPartition, unpackPartition, missingDates, recoverDay, addDays } from '../../js/economy-killstats.js';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const CACHE = process.env.TIBINANCE_ECONOMY_CACHE ?? join(ROOT, '.cache/economy');
const SOURCES = join(ROOT, 'data/economy/sources');
export const UPSTREAMS = [
  { id: 'archive', repo: 'tibiamaps/tibia-kill-stats-from-2022-08-23-to-2025-12-04' },
  { id: 'current', repo: 'tibiamaps/tibia-kill-stats' },
];
const FILE = /^data\/([a-z]+)\/(\d{4}-\d{2})-\d{2}\.json$/;
const sha256 = data => createHash('sha256').update(data).digest('hex');
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 1 << 30, stdio: ['ignore', 'pipe', 'pipe'] });
const readJson = (path, fallback) => (existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : fallback);

export function partitionPath(world, month, cache = CACHE) {
  return join(cache, 'killstats', world.toLowerCase(), `${month}.bin.gz`);
}

function clone(upstream) {
  const dir = join(CACHE, 'upstream', upstream.id);
  if (!existsSync(join(dir, '.git'))) {
    mkdirSync(join(CACHE, 'upstream'), { recursive: true });
    git(join(CACHE, 'upstream'), 'clone', '-q', '--depth=1', '--filter=blob:none', '--no-checkout', `https://github.com/${upstream.repo}`, upstream.id);
    git(dir, 'sparse-checkout', 'init', '--no-cone');
  } else {
    git(dir, 'fetch', '-q', '--depth=1', '--filter=blob:none', 'origin', 'HEAD');
  }
  const head = git(dir, 'rev-parse', existsSync(join(dir, '.git', 'FETCH_HEAD')) ? 'FETCH_HEAD' : 'HEAD').trim();
  const committedAt = git(dir, 'show', '-s', '--format=%cI', head).trim();
  const files = git(dir, 'ls-tree', '-r', head, 'data/').split('\n').filter(Boolean).map(line => {
    const [meta, path] = line.split('\t');
    const [mode, , blob] = meta.split(' ');
    const m = path.match(FILE);
    return m && mode === '100644' ? { upstream: upstream.id, dir: m[1], date: path.slice(-15, -5), month: m[2], path, blob } : null;
  }).filter(Boolean);
  return { ...upstream, dir, head, committedAt, files };
}

function checkoutMonth(src, month) {
  git(src.dir, 'sparse-checkout', 'set', '--no-cone', `data/*/${month}-*.json`);
  git(src.dir, 'checkout', '-q', '--detach', src.head);
}

function clearCheckout(src) {
  git(src.dir, 'sparse-checkout', 'set', '--no-cone', '/.nothing');
  git(src.dir, 'checkout', '-q', '--detach', src.head);
}

// Upstream commits that added each date ("Add data for date=YYYY-MM-DD"), from the GitHub API, cached.
async function availability(upstream, token) {
  const cachePath = join(CACHE, 'commits', `${upstream.id}.json`);
  const cached = readJson(cachePath, []);
  const known = new Set(cached.map(c => c.sha));
  const fresh = [];
  for (let page = 1; page < 100; page++) {
    const r = await fetch(`https://api.github.com/repos/${upstream.repo}/commits?per_page=100&page=${page}`,
      { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'tibinance-economy', ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
    if (!r.ok) throw new Error(`${upstream.repo} commits: HTTP ${r.status}`);
    const list = await r.json();
    let reached = false;
    for (const c of list) {
      if (known.has(c.sha)) { reached = true; break; }
      fresh.push({ sha: c.sha, at: c.commit.committer.date, message: c.commit.message.split('\n')[0] });
    }
    if (reached || list.length < 100) break;
  }
  const all = [...fresh, ...cached];
  mkdirSync(join(CACHE, 'commits'), { recursive: true });
  writeFileSync(cachePath, JSON.stringify(all));
  return all;
}

function token() {
  if (process.env.GH_TOKEN || process.env.GITHUB_TOKEN) return process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  try { return execFileSync('gh', ['auth', 'token'], { encoding: 'utf8' }).trim(); } catch { return null; }
}

export async function ingest({ months: only = null, full = false, log = console.log } = {}) {
  mkdirSync(SOURCES, { recursive: true });
  const racesPath = join(SOURCES, 'races.json'), manifestPath = join(SOURCES, 'killstats.json');
  const raceDoc = readJson(racesPath, { format: 1, races: [] });
  // An interrupted run may have added races after the committed dictionary; they are kept in its checkpoint.
  for (const r of readJson(join(CACHE, 'ingest-progress.json'), {}).races ?? []) if (!raceDoc.races.includes(r)) raceDoc.races.push(r);
  const raceId = new Map(raceDoc.races.map((r, i) => [r, i]));
  const idOf = name => { if (!raceId.has(name)) { raceId.set(name, raceDoc.races.length); raceDoc.races.push(name); } return raceId.get(name); };
  const previous = readJson(manifestPath, { worlds: {} });
  // Months finished by an interrupted run (cache-side checkpoint), so a rerun resumes instead of restarting.
  const progressPath = join(CACHE, 'ingest-progress.json');
  previous.months = { ...(previous.months ?? {}), ...readJson(progressPath, {}).months };

  const sources = UPSTREAMS.map(clone);
  const tok = token();
  const commits = Object.fromEntries(await Promise.all(UPSTREAMS.map(async u => [u.id, await availability(u, tok)])));

  // Every file of both repositories by world directory and date; an overlap must be the same file.
  const byWorld = new Map(), conflicts = [];
  for (const src of sources) for (const f of src.files) {
    if (!byWorld.has(f.dir)) byWorld.set(f.dir, new Map());
    const dates = byWorld.get(f.dir), other = dates.get(f.date);
    if (other && other.blob !== f.blob) conflicts.push({ world: f.dir, date: f.date, upstreams: [other.upstream, f.upstream] });
    if (!other) dates.set(f.date, f);
  }
  // Missing dates per world, and the later files whose weekly counters can recover them.
  const missing = new Map(), needWeek = new Set();
  for (const [dir, dates] of byWorld) {
    const gaps = missingDates([...dates.keys()]);
    missing.set(dir, gaps);
    for (const d of gaps) for (let k = 1; k <= 6; k++) if (dates.has(addDays(d, k))) needWeek.add(`${dir} ${addDays(d, k)}`);
  }

  const months = [...new Set(sources.flatMap(s => s.files.map(f => f.month)))].sort().filter(m => !only || only.includes(m));
  const monthKey = month => sha256([...byWorld].flatMap(([dir, dates]) => [...dates.values()].filter(f => f.month === month)
    .map(f => `${f.upstream}:${f.path}\t${f.blob}`)).sort().join('\n'));
  const worldNames = new Map(Object.entries(previous.worlds ?? {}).map(([name, w]) => [w.dir, name]));
  const weekRows = new Map(); // "dir date" -> {date, dayRows, weekRows}
  let done = 0;
  for (const month of months) {
    const key = monthKey(month);
    const cachedAll = [...byWorld].filter(([, d]) => [...d.values()].some(f => f.month === month))
      .every(([dir]) => existsSync(partitionPath(worldNames.get(dir) ?? dir, month)));
    if (!full && previous.months?.[month]?.sourceKey === key && cachedAll && ![...needWeek].some(k => k.split(' ')[1].startsWith(month))) continue;
    for (const src of sources) if (src.files.some(f => f.month === month)) checkoutMonth(src, month);
    for (const [dir, dates] of [...byWorld].sort()) {
      const files = [...dates.values()].filter(f => f.month === month).sort((a, b) => (a.date < b.date ? -1 : 1));
      if (!files.length) continue;
      const days = [];
      let world = worldNames.get(dir);
      for (const f of files) {
        const raw = readFileSync(join(sources.find(s => s.id === f.upstream).dir, f.path));
        const data = JSON.parse(raw).killstatistics;
        world = data.world ?? world ?? dir;
        const rows = [], week = [];
        for (const e of data.entries) {
          const id = idOf(e.race);
          if (e.last_day_killed || e.last_day_players_killed) rows.push([id, e.last_day_killed, e.last_day_players_killed]);
          if (e.last_week_killed || e.last_week_players_killed) week.push([id, e.last_week_killed, e.last_week_players_killed]);
        }
        days.push({ date: f.date, sha256: sha256(raw), blob: f.blob, upstream: f.upstream, rows });
        if (needWeek.has(`${dir} ${f.date}`)) weekRows.set(`${dir} ${f.date}`, { date: f.date, dayRows: rows, weekRows: week });
      }
      worldNames.set(dir, world);
      writePartition(world, dir, month, days, raceDoc.races.length);
    }
    for (const src of sources) if (src.files.some(f => f.month === month)) clearCheckout(src);
    previous.months = { ...(previous.months ?? {}), [month]: { sourceKey: key } };
    writeFileSync(progressPath, JSON.stringify({ months: previous.months, races: raceDoc.races }));
    writeFileSync(racesPath, JSON.stringify({ format: 1, note: 'Append-only: the id of a kill-statistics race is its position. Names are as TibiaData reports them.', races: raceDoc.races }, null, 1) + '\n');
    done++;
    log(`${month}: ${[...byWorld].filter(([, d]) => [...d.values()].some(f => f.month === month)).length} worlds`);
  }

  // Exact recovery of isolated missing days from the weekly counter of a later file.
  const recovered = new Map();
  for (const [dir, gaps] of missing) {
    const world = worldNames.get(dir) ?? dir;
    for (const d of gaps) {
      for (let k = 1; k <= 6; k++) {
        const later = weekRows.get(`${dir} ${addDays(d, k)}`);
        if (!later) continue;
        const dayRows = new Map();
        for (let j = 1; j <= 6; j++) {
          const other = addDays(later.date, -j);
          if (other === d) continue;
          const rows = rowsOf(world, other);
          if (rows) dayRows.set(other, rows);
        }
        const rows = recoverDay(d, later, dayRows);
        if (rows) { addRecovered(world, dir, d, rows, raceDoc.races.length); recovered.set(`${dir} ${d}`, later.date); break; }
      }
    }
  }

  // The committed manifest: everything needed to know what was ingested and to check a rebuild.
  const manifest = {
    format: 1,
    note: 'Kill statistics ingested from the tibiamaps repositories (not republished). Partitions are cached, rebuilt from the pinned commits; the digests below prove a rebuild matches. A file dated D reports the kills of the day before D.',
    upstreams: sources.map(s => ({ id: s.id, repo: s.repo, commit: s.head, committedAt: s.committedAt, files: s.files.length })),
    races: raceDoc.races.length,
    months: previous.months ?? {},
    conflicts,
    availability: availabilityByDate(commits),
    worlds: {},
  };
  for (const [dir, dates] of [...byWorld].sort()) {
    const world = worldNames.get(dir) ?? dir;
    const list = [...dates.keys()].sort();
    const monthsOf = [...new Set(list.map(d => d.slice(0, 7)))];
    manifest.worlds[world] = {
      dir, first: list[0], last: list.at(-1), files: list.length,
      missing: missing.get(dir).filter(d => !recovered.has(`${dir} ${d}`)),
      recovered: missing.get(dir).filter(d => recovered.has(`${dir} ${d}`)).map(d => ({ date: d, from: recovered.get(`${dir} ${d}`) })),
      partitions: Object.fromEntries(monthsOf.map(m => {
        const p = partitionPath(world, m);
        if (!existsSync(p)) return [m, previous.worlds?.[world]?.partitions?.[m] ?? null];
        const { header } = unpackPartition(gunzipSync(readFileSync(p)));
        return [m, { source: sha256(header.days.map(d => `${d.date}\t${d.sha256}\n`).join('')), partition: sha256(readFileSync(p)), days: header.days.length, recovered: header.recovered }];
      })),
    };
  }
  writeFileSync(racesPath, JSON.stringify({ format: 1, note: 'Append-only: the id of a kill-statistics race is its position. Names are as TibiaData reports them.', races: raceDoc.races }, null, 1) + '\n');
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 1) + '\n');
  rmSync(progressPath, { force: true });
  return { months: done, worlds: byWorld.size, races: raceDoc.races.length, recovered: recovered.size, conflicts: conflicts.length };
}

function writePartition(world, dir, month, days, races, recovered = []) {
  const header = { format: 1, world, dir, month, races, recovered, days: days.map(({ rows, ...d }) => d) };
  const path = partitionPath(world, month);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, gzipSync(packPartition(header, days.map(d => ({ rows: d.rows }))), { level: 9 }));
}

function rowsOf(world, date) {
  const p = partitionPath(world, date.slice(0, 7));
  if (!existsSync(p)) return null;
  const day = unpackPartition(gunzipSync(readFileSync(p))).days.find(d => d.date === date);
  return day ? day.rows : null;
}

function addRecovered(world, dir, date, rows, races) {
  const p = partitionPath(world, date.slice(0, 7));
  const existing = existsSync(p) ? unpackPartition(gunzipSync(readFileSync(p))) : { header: { recovered: [] }, days: [] };
  const days = existing.days.filter(d => d.date !== date).concat([{ date, sha256: null, blob: null, upstream: null, recoveredFromWeekly: true, rows }])
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  writePartition(world, dir, date.slice(0, 7), days, races, [...new Set([...(existing.header.recovered ?? []), date])].sort());
}

function availabilityByDate(commits) {
  const out = {};
  for (const [upstream, list] of Object.entries(commits)) {
    for (const c of list) {
      const m = c.message.match(/^Add data for date=(\d{4}-\d{2}-\d{2})/);
      if (m && (!out[m[1]] || c.at < out[m[1]].at)) out[m[1]] = { at: c.at, upstream, commit: c.sha };
    }
  }
  return Object.fromEntries(Object.entries(out).sort());
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const i = args.indexOf('--months');
  const r = await ingest({ months: i >= 0 ? args[i + 1].split(',') : null, full: args.includes('--full') });
  console.log(JSON.stringify(r));
}
