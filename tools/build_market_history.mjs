// Builds the Markets page dataset, data/market-history/<asset>/, from frozen
// inputs. The canonical capture dataset and the research inputs are only read.
//
//   node tools/build_market_history.mjs          rebuild and write
//   node tools/build_market_history.mjs --check  fail if the committed files differ
//
// Rerun after installing a new data/observations.json or new frozen inputs
// (tools/fetch_market_history.mjs). The output is a pure function of the
// inputs: no clock, no network, stable ordering.
import { createHash } from 'node:crypto';
import { lifecycleFacts, validate as validateEvents } from '../js/events.js';
import { gunzipSync } from 'node:zlib';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, relative } from 'node:path';
import { ASSETS, addDays, bestOfferCloses, dailyTransactionSeries, fromCapture, fromTibiaMarket, latestCapturedDepth, latestDailyStatistics,
  mergeDaily, mergeObservations } from '../js/market-history.js';
import { battleyeColour } from '../js/tibiadata.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CAPTURES = 'data/observations.json';
// TibiaMarket.top item_history snapshots for item 22118, frozen by the research
// (fetch_api.py never refetches; validate.py checks their hashes).
const TIBIA_MARKET = 'reports/tc-cycle/inputs/api';
// The Markets dataset's own frozen inputs: more worlds and newer copies, gzipped
// as received, the TibiaData world snapshot and the retired-world facts.
const MORE_HISTORY = 'data/market-history/inputs/tibiamarket';
const WORLD_SNAPSHOT = 'data/market-history/inputs/worlds.json';
const RETIRED = 'data/market-history/inputs/retired-worlds.json';
// Individually reviewed snapshots whose best-offer pair is withheld; not a rule.
const EXCLUSIONS = 'data/market-history/inputs/best-offer-exclusions.json';

const count = (counter, key) => { counter[key] = (counter[key] ?? 0) + 1; };
const sorted = counter => Object.fromEntries(Object.entries(counter).sort(([a], [b]) => a.localeCompare(b)));
const span = days => days.length ? { days: days.length, first: days[0], last: days.at(-1) } : { days: 0 };
export const worldFile = world => `worlds/${world.toLowerCase()}.json`;

/*
 * captures: canonical Tibinance captures. tibiaMarket: [{world, rows}] with the
 * world's display name; a world may appear more than once (an older and a newer
 * copy). registry: {active: TibiaData world entries, retired: retired-world
 * facts}. inputs: [{path, sha256}] recorded for provenance.
 * Returns {index, overview, worlds: Map(world -> file object)}. The overview
 * carries what the Screener compares across worlds and the index does not: daily
 * transaction counters per side and the latest captured depth.
 */
export function buildMarketHistory({ captures, tibiaMarket, registry, inputs, exclusions = [], asset = ASSETS['tibia-coin'] }) {
  const names = new Map();
  const canonical = world => {
    const key = world.toLowerCase();
    if (!names.has(key)) names.set(key, world);
    else if (names.get(key) !== world) throw new Error(`World spelled two ways: ${names.get(key)} / ${world}`);
    return key;
  };
  const perWorld = new Map();
  const of = world => {
    const key = canonical(world);
    if (!perWorld.has(key)) perWorld.set(key, { observations: [], daily: [], dailyObservations: [] });
    return perWorld.get(key);
  };
  const conversion = {
    tibiaMarket: { rows: 0, duplicateRows: 0, observations: 0, dailyReports: 0, notConverted: {} },
    tibinance: { captures: 0, observations: 0, notConverted: {} }
  };
  const active = new Map(registry.active.map(w => [w.name, w]));
  const retired = new Map(registry.retired.map(w => [w.world, w]));
  // Every current world is listed, with or without market data.
  for (const world of active.keys()) of(world);

  // Copies of one world's history overlap, and a snapshot is sometimes stored twice
  // a fraction of a millisecond apart: rows of one millisecond must be identical
  // apart from that fraction, and count once.
  const rowsByWorld = new Map();
  for (const { world, rows } of tibiaMarket) {
    const seen = rowsByWorld.get(world) ?? rowsByWorld.set(world, new Map()).get(world);
    for (const row of rows) {
      const instant = Math.round(row.time * 1000), prior = seen.get(instant);
      if (prior === undefined) seen.set(instant, row);
      else if (JSON.stringify({ ...prior, time: 0 }) === JSON.stringify({ ...row, time: 0 })) conversion.tibiaMarket.duplicateRows++;
      else throw new Error(`${world}: two different rows at ${new Date(instant).toISOString()}`);
    }
  }
  // A reviewed exclusion names one source snapshot and the pair it withholds; the
  // snapshot's other data stays. An entry that no longer matches its source fails.
  const reviewed = new Map(exclusions.map(x => [`${x.world}|${x.time}`, x])), applied = new Set();
  for (const [world, seen] of rowsByWorld) {
    const target = of(world);
    for (const row of [...seen.values()].sort((a, b) => a.time - b.time)) {
      if (row.id !== asset.tibiaMarketItemId) throw new Error(`${world}: item ${row.id} is not ${asset.name}`);
      conversion.tibiaMarket.rows++;
      let { observation, daily, excluded } = fromTibiaMarket(row);
      const exclusion = reviewed.get(`${world}|${row.time}`);
      if (exclusion) {
        if (observation?.capturedAtUtc !== exclusion.capturedAtUtc || observation.sell !== exclusion.sell || observation.buy !== exclusion.buy) {
          throw new Error(`Reviewed exclusion for ${world} at ${exclusion.capturedAtUtc} no longer matches its source row`);
        }
        applied.add(`${world}|${row.time}`);
        delete observation.sell; delete observation.buy;
        if (!observation.statistics30d) observation = null;
        excluded = [...excluded, 'reviewedBestOfferExclusion'];
      }
      for (const reason of excluded) count(conversion.tibiaMarket.notConverted, reason);
      if (observation) { target.observations.push(observation); conversion.tibiaMarket.observations++; }
      if (daily) {
        target.daily.push(daily);
        target.dailyObservations.push({ ...daily, source: 'tibiamarket', sourceTimestamp: row.time,
          capturedAtUtc: new Date(Math.round(row.time * 1000)).toISOString() });
        conversion.tibiaMarket.dailyReports++;
      }
      if (!observation && !daily) count(conversion.tibiaMarket.notConverted, 'noUsableFields');
    }
  }
  for (const [key, x] of reviewed) if (!applied.has(key)) throw new Error(`Reviewed exclusion for ${x.world} at ${x.capturedAtUtc} matches no source row`);
  // Every Tibinance capture is Tibia Coins: ingestion rejects any other item.
  for (const capture of captures) {
    const target = of(capture.world);
    conversion.tibinance.captures++;
    const { observation, excluded } = fromCapture(capture);
    for (const reason of excluded) count(conversion.tibinance.notConverted, reason);
    if (observation) { target.observations.push(observation); conversion.tibinance.observations++; }
  }

  // Retired worlds keep their own histories; a successor lists them, nothing is spliced.
  const formedFrom = new Map();
  for (const r of retired.values()) {
    if (active.has(r.world)) throw new Error(`${r.world} is both current and retired`);
    if (!active.has(r.mergedInto)) throw new Error(`${r.world} merged into ${r.mergedInto}, which is not a current world`);
    formedFrom.set(r.mergedInto, [...(formedFrom.get(r.mergedInto) ?? []), r.world].sort());
  }
  const worlds = new Map(), summaries = [], overview = [];
  let through = ''; // the latest server day anything in the dataset describes
  const dailyTotals = { days: 0, conflictingDaysDropped: 0, conflictingDaysResolved: 0, checked30dTotals: 0, matching30dTotals: 0 };
  for (const key of [...perWorld.keys()].sort()) {
    const world = names.get(key), entry = perWorld.get(key);
    const observations = mergeObservations(entry.observations);
    const { conflicts } = mergeDaily(entry.daily);
    const daily = latestDailyStatistics(entry.dailyObservations);
    dailyTotals.days += daily.length;
    dailyTotals.conflictingDaysResolved += conflicts.length;

    // Evidence for the day alignment: the 30 completed days before a snapshot's
    // server day sum to that snapshot's 30-day transaction counts.
    const byDay = new Map(daily.map(d => [d.serverDay, d]));
    for (const o of observations) {
      if (!o.statistics30d) continue;
      const window = Array.from({ length: 30 }, (_, i) => byDay.get(addDays(o.serverDay, -1 - i)));
      if (window.some(d => !d?.sell || !d?.buy)) continue;
      dailyTotals.checked30dTotals++;
      if (['sell', 'buy'].every(s => window.reduce((t, d) => t + d[s].transactions, 0) === o.statistics30d[s].transactions)) dailyTotals.matching30dTotals++;
    }

    const closes = bestOfferCloses(observations);
    const latest = observations.findLast(o => 'sell' in o);
    const lastDay = [observations.at(-1)?.serverDay, daily.at(-1)?.serverDay].filter(Boolean).sort().at(-1);
    if (lastDay > through) through = lastDay;
    const current = active.get(world), former = retired.get(world);
    if (!current && !former) throw new Error(`${world} has market data but is neither a current world nor a known retired one`);
    if (former && lastDay > former.offline) throw new Error(`${world} has data after it went offline on ${former.offline}`);
    summaries.push({
      world, file: worldFile(world),
      ...(current
        ? { status: 'active', type: current.pvp_type, battleye: battleyeColour(current).colour, location: current.location }
        : { status: 'retired', type: former.type, battleye: former.battleye, location: former.location, offline: former.offline, mergedInto: former.mergedInto }),
      ...(formedFrom.has(world) ? { formedFrom: formedFrom.get(world) } : {}),
      observations: observations.length,
      bestOfferDays: span(closes.map(c => c.serverDay)),
      dailyStatisticsDays: span(daily.map(d => d.serverDay)),
      ...(latest ? { latestBestOffer: { capturedAtUtc: latest.capturedAtUtc, serverDay: latest.serverDay, sell: latest.sell, buy: latest.buy } } : {}),
      // [serverDay, sell, buy] per observed day, so the watchlist needs no world file.
      bestOfferCloses: closes.map(c => [c.serverDay, c.sell, c.buy])
    });
    const transactions = dailyTransactionSeries(daily), depth = latestCapturedDepth(observations);
    if (transactions || depth) overview.push({ world, ...(transactions ? { transactions } : {}), ...(depth ? { depth } : {}) });
    // Keep acquisition-level daily reports even when the derived chart projection
    // cannot choose a unique value for a server day. Never discard source evidence.
    worlds.set(world, { asset: asset.id, world, observations, dailyStatistics: daily,
      dailyStatisticsObservations: mergeObservations(entry.dailyObservations) });
  }
  for (const source of Object.values(conversion)) source.notConverted = sorted(source.notConverted);
  return {
    index: { format: 1, asset, through, inputs, conversion, dailyStatistics: dailyTotals, worlds: summaries },
    overview: { format: 1, asset: asset.id, through, worlds: overview },
    worlds
  };
}

// Records one per line, so a rebuild diff shows exactly which days changed.
export function formatJson(value, indent = '') {
  if (Array.isArray(value) && value.length && value.every(v => v && typeof v === 'object' && !Array.isArray(v))) {
    return `[\n${value.map(v => `${indent}  ${JSON.stringify(v)}`).join(',\n')}\n${indent}]`;
  }
  if (value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length) {
    return `{\n${Object.entries(value).map(([k, v]) => `${indent}  ${JSON.stringify(k)}: ${formatJson(v, `${indent}  `)}`).join(',\n')}\n${indent}}`;
  }
  return JSON.stringify(value);
}

async function readInputs(root) {
  const sha = bytes => createHash('sha256').update(bytes).digest('hex');
  const read = async path => {
    const bytes = await readFile(join(root, path));
    return { path, sha256: sha(bytes), value: JSON.parse(bytes) };
  };
  const captures = await read(CAPTURES);
  const snapshot = await read(WORLD_SNAPSHOT), facts = await read(RETIRED), reviewed = await read(EXCLUSIONS);
  const events = await read('data/events/events.json');
  const errors = validateEvents(events.value);
  if (errors.length) throw new Error(errors.join('\n'));
  const retirements = lifecycleFacts(events.value).retirements;
  const retired = facts.value.worlds.map(w => {
    if ('offline' in w || 'mergedInto' in w) throw new Error(`${w.world}: event facts belong in canonical Events`);
    if (!retirements[w.world]) throw new Error(`${w.world}: canonical retirement event is missing`);
    return {...w,...retirements[w.world]};
  });
  const manifest = JSON.parse(await readFile(join(root, TIBIA_MARKET, 'manifest.json'), 'utf8'));
  const names = new Map(manifest.map(m => [m.world.toLowerCase(), m.world]));
  const files = (await readdir(join(root, TIBIA_MARKET))).filter(f => f.endsWith('.json') && f !== 'manifest.json').sort();
  const tibiaMarket = [];
  for (const file of files) {
    const world = names.get(file.slice(0, -5));
    if (!world) throw new Error(`${file} is not in the TibiaMarket manifest`);
    tibiaMarket.push({ world, ...(await read(`${TIBIA_MARKET}/${file}`)) });
  }
  // Gzipped copies: each must decompress to the bytes its manifest describes.
  for (const entry of JSON.parse(await readFile(join(root, MORE_HISTORY, 'manifest.json'), 'utf8'))) {
    const path = `${MORE_HISTORY}/${entry.world.toLowerCase()}.json.gz`;
    const stored = await readFile(join(root, path)), raw = gunzipSync(stored);
    if (sha(raw) !== entry.sha256) throw new Error(`${path} does not match its manifest`);
    tibiaMarket.push({ world: entry.world, path, sha256: sha(stored), value: JSON.parse(raw) });
  }
  return {
    captures: captures.value,
    tibiaMarket: tibiaMarket.map(({ world, value }) => ({ world, rows: value })),
    registry: { active: snapshot.value.worlds, retired },
    exclusions: reviewed.value.exclusions,
    inputs: [captures, snapshot, facts, events, reviewed, ...tibiaMarket].map(({ path, sha256 }) => ({ path, sha256 }))
  };
}

export async function outputFiles(root = ROOT, asset = ASSETS['tibia-coin']) {
  const { index, overview, worlds } = buildMarketHistory({ ...(await readInputs(root)), asset });
  const files = new Map([['index.json', formatJson(index) + '\n'], ['overview.json', formatJson(overview) + '\n']]);
  for (const [world, data] of worlds) files.set(worldFile(world), formatJson(data) + '\n');
  return { directory: join(root, 'data/market-history', asset.id), files, index };
}

async function existing(directory) {
  const found = [];
  async function walk(dir) {
    let entries;
    try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) e.isDirectory() ? await walk(join(dir, e.name)) : found.push(relative(directory, join(dir, e.name)));
  }
  await walk(directory);
  return found.sort();
}

// Paths of every file that is missing, different or no longer produced.
export async function staleFiles(root = ROOT) {
  const { directory, files } = await outputFiles(root);
  const stale = [];
  for (const [path, content] of files) {
    const current = await readFile(join(directory, path), 'utf8').catch(() => null);
    if (current !== content) stale.push(path);
  }
  for (const path of await existing(directory)) if (!files.has(path)) stale.push(path);
  return stale;
}

async function main() {
  if (process.argv.includes('--check')) {
    const stale = await staleFiles();
    if (stale.length) {
      console.error(`Market history is out of date (${stale.length} files). Run: node tools/build_market_history.mjs`);
      process.exitCode = 1;
    } else console.log('Market history is current.');
    return;
  }
  const { directory, files, index } = await outputFiles();
  for (const path of await existing(directory)) if (!files.has(path)) await rm(join(directory, path));
  await mkdir(join(directory, 'worlds'), { recursive: true });
  for (const [path, content] of files) await writeFile(join(directory, path), content);
  console.log(JSON.stringify({ directory: relative(ROOT, directory), worlds: index.worlds.length,
    observations: index.worlds.reduce((t, w) => t + w.observations, 0), dailyStatisticsDays: index.dailyStatistics.days }));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
