// Gold generation potential per world and day, from kill statistics and loot evidence (Stage C5).
//
//   node tools/economy/build_gold.mjs                         latest-evidence reconstruction -> data/economy/gold/
//   node tools/economy/build_gold.mjs --as-of 2025-06-30T00:00:00Z
//                                                             point-in-time reconstruction -> .cache/economy/gold-pit/
//   node tools/economy/build_gold.mjs --check                 fail unless data/economy/gold/ is a fresh build
//
// For every world and kill day (a file dated D reports the day before D):
//   kills          all creature kills observed that day (every race, valued or not)
//   killsValued    kills of races matched to a creature with an applicable loot sample (strict rule)
//   directCoins    sum of killsValued x the sample's coins per kill (gold, platinum and crystal at face value)
//   npcPotential   sum of killsValued x the sample's other items per kill at the highest NPC buy price
//   playerDeaths   players killed by creatures that day (an activity proxy, not a population measure)
//   grossStable    directCoins + npcPotential over the stable creature set only: creatures valued from the first
//                  kill day of the data, so its changes come from kills, not from newly valued creatures
//   status         o observed, r recovered exactly from the weekly counter, m missing (all values null)
// grossPotential = directCoins + npcPotential is derived, never stored twice. Every value covers valued creatures
// only; kill coverage (killsValued / kills) says how much of the observed killing is valued. Nothing is scaled up.
// No liquidation rate is assumed: npcPotential is what NPCs would pay, not gold that entered the game.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { unpackPartition, previousDay, addDays } from '../../js/economy-killstats.js';
import { versionDater, evidenceAt, candidatesByCreature, valueOn, MIN_KILLS } from '../../js/economy-value.js';
import { readEvidence } from './fetch_loot.mjs';
import { partitionPath } from './ingest_killstats.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SOURCES = join(ROOT, 'data/economy/sources');
const GOLD = join(ROOT, 'data/economy/gold');
export const METHODOLOGY = { version: 1, rule: 'strict', minKills: MIN_KILLS, killDay: 'file date minus one day',
  valuation: 'TibiaWiki loot samples: coins at face value; other items at the highest NPC buy price of the price vintage',
  stableSet: 'creatures with an applicable sample on the first kill day of the data' };
const readJson = p => JSON.parse(readFileSync(p, 'utf8'));
const sha256 = s => createHash('sha256').update(s).digest('hex');
const round = v => (v === null ? null : Math.round(v));

export function loadInputs() {
  return {
    killstats: readJson(join(SOURCES, 'killstats.json')),
    map: readJson(join(SOURCES, 'creature-map.json')),
    versions: readJson(join(SOURCES, 'versions.json')).versions,
    loot: readEvidence(join(SOURCES, 'loot')),
    prices: readEvidence(join(SOURCES, 'item-prices')),
    readPartition: (world, month) => {
      const path = partitionPath(world, month);
      if (!existsSync(path)) throw new Error(`${path} is missing: run tools/economy/ingest_killstats.mjs first`);
      return unpackPartition(gunzipSync(readFileSync(path)));
    },
  };
}

export function buildGold({ asOf = null, inputs = loadInputs() } = {}) {
  const { killstats, map, versions, loot, prices, readPartition } = inputs;
  const evidence = evidenceAt(loot, prices, asOf);
  const dateOf = versionDater(versions);
  const candidates = candidatesByCreature(evidence, dateOf);
  const pageOfRace = new Map(map.races.filter(r => r.pageId).map(r => [r.raceId, r.pageId]));
  const creatureName = new Map(map.races.filter(r => r.pageId).map(r => [r.pageId, r.creature]));
  const raceCandidates = new Map([...pageOfRace].map(([race, page]) => [race, candidates.get(page) ?? null]));
  // A kill file dated D is only usable at a cutoff if it was available then (correction 11).
  const availableBy = date => !asOf || (killstats.availability[date]?.at && killstats.availability[date].at <= asOf);

  const firstDay = Object.values(killstats.worlds).map(w => previousDay(w.first)).sort()[0];
  const stable = new Set([...candidates].filter(([, c]) => valueOn(c, firstDay)).map(([page]) => page));
  const memo = new Map();
  const valueFor = (race, day) => {
    const c = raceCandidates.get(race);
    if (!c) return null;
    const k = `${race} ${day}`;
    if (!memo.has(k)) memo.set(k, valueOn(c, day));
    return memo.get(k);
  };

  const worlds = [], files = new Map(), creatures = new Map(), monthly = {};
  for (const [world, w] of Object.entries(killstats.worlds).sort()) {
    const first = previousDay(w.first), last = previousDay(w.last);
    const n = Math.round((Date.parse(last) - Date.parse(first)) / 86400000) + 1;
    const arr = () => new Array(n).fill(null);
    const s = { directCoins: arr(), npcPotential: arr(), kills: arr(), killsValued: arr(), playerDeaths: arr(), grossStable: arr(), status: new Array(n).fill('m') };
    const months = new Map();
    for (const month of Object.keys(w.partitions).sort()) {
      const part = readPartition(world, month);
      for (const day of part.days) {
        if (!availableBy(day.date)) continue;
        const killDay = previousDay(day.date);
        const i = Math.round((Date.parse(killDay) - Date.parse(first)) / 86400000);
        let coins = 0, npc = 0, kills = 0, valued = 0, deaths = 0, stableGross = 0;
        const m = months.get(killDay.slice(0, 7)) ?? { kills: 0, killsValued: 0, directCoins: 0, npcPotential: 0, creatures: new Map() };
        for (const [race, killed, players] of day.rows) {
          kills += killed; deaths += players;
          const v = killed ? valueFor(race, killDay) : null;
          if (!v) continue;
          valued += killed;
          coins += killed * v.directCoins; npc += killed * v.npcPotential;
          const page = pageOfRace.get(race);
          if (stable.has(page)) stableGross += killed * (v.directCoins + v.npcPotential);
          const c = m.creatures.get(page) ?? [0, 0, 0];
          c[0] += killed; c[1] += killed * v.directCoins; c[2] += killed * v.npcPotential;
          m.creatures.set(page, c);
        }
        Object.assign(m, { kills: m.kills + kills, killsValued: m.killsValued + valued, directCoins: m.directCoins + coins, npcPotential: m.npcPotential + npc });
        months.set(killDay.slice(0, 7), m);
        s.directCoins[i] = round(coins); s.npcPotential[i] = round(npc); s.kills[i] = kills; s.killsValued[i] = valued;
        s.playerDeaths[i] = deaths; s.grossStable[i] = round(stableGross); s.status[i] = day.recoveredFromWeekly ? 'r' : 'o';
      }
    }
    const status = s.status.join('');
    const sum = k => s[k].reduce((a, v) => a + (v ?? 0), 0);
    const contributions = [...months].sort().map(([month, m]) => {
      const ranked = [...m.creatures].sort((a, b) => (b[1][1] + b[1][2]) - (a[1][1] + a[1][2]));
      const top = ranked.slice(0, 30), rest = ranked.slice(30);
      const restSum = rest.reduce((a, [, c]) => [a[0] + c[0], a[1] + c[1], a[2] + c[2]], [0, 0, 0]);
      for (const [page] of top) creatures.set(page, creatureName.get(page));
      return { month, kills: m.kills, killsValued: m.killsValued, directCoins: round(m.directCoins), npcPotential: round(m.npcPotential),
        creatures: top.map(([page, c]) => [page, c[0], round(c[1]), round(c[2])]), other: { creatures: rest.length, kills: restSum[0], directCoins: round(restSum[1]), npcPotential: round(restSum[2]) } };
    });
    files.set(`worlds/${w.dir}.json`, { world, first, last, ...s, status });
    // Per month: [month, directCoins, npcPotential, kills, killsValued, days with data, days in the month's span].
    const perMonth = new Map();
    status.split('').forEach((st, i) => {
      const month = new Date(Date.parse(`${first}T00:00:00Z`) + i * 86400000).toISOString().slice(0, 7);
      const m = perMonth.get(month) ?? [month, 0, 0, 0, 0, 0, 0];
      m[6]++;
      if (st !== 'm') { m[1] += s.directCoins[i]; m[2] += s.npcPotential[i]; m[3] += s.kills[i]; m[4] += s.killsValued[i]; m[5]++; }
      perMonth.set(month, m);
    });
    monthly[w.dir] = [...perMonth.values()];
    files.set(`contributions/${w.dir}.json`, { world, note: 'Monthly totals; the 30 creatures with the largest gross potential, then the rest summed. Rows: [creature page id, kills, directCoins, npcPotential].', months: contributions });
    worlds.push({ world, dir: w.dir, first, last, days: n, observed: status.split('').filter(c => c === 'o').length, recovered: status.split('').filter(c => c === 'r').length,
      missing: status.split('').filter(c => c === 'm').length, kills: sum('kills'), killsValued: sum('killsValued'), killCoverage: sum('kills') ? sum('killsValued') / sum('kills') : null,
      directCoins: sum('directCoins'), npcPotential: sum('npcPotential') });
  }
  const creaturesOut = {};
  for (const [page, list] of [...candidates].sort((a, b) => a[0] - b[0])) {
    if (!creatureName.has(page)) continue;
    creaturesOut[page] = { creature: creatureName.get(page), stable: stable.has(page), samples: list.map(c => ({ sampleKey: c.sampleKey, version: c.version, effectiveAt: c.effectiveAt,
      effectiveBasis: c.effectiveBasis, availableAt: c.availableAt, kills: c.kills, directCoins: c.directCoins, npcPotential: c.npcPotential, unpriced: c.unpriced })) };
  }
  const index = {
    format: 1,
    note: 'Estimated gold generation potential from valued creatures: directCoins (coins dropped) and npcPotential (other loot at NPC prices; potential, not issued gold). Not money supply, inflation, GDP or a TC price model. See docs/economy.md.',
    mode: asOf ? { kind: 'point-in-time', asOf } : { kind: 'latest-evidence' },
    methodology: METHODOLOGY,
    evidence: { lootRecords: loot.length, liveSamples: evidence.samples.size, latestLootRevision: loot.reduce((a, r) => (r.revTimestamp > a ? r.revTimestamp : a), ''),
      prices: evidence.priceVintage, versions: versions.length, creatureMap: { matched: map.summary.matched, races: map.summary.races } },
    killstats: killstats.upstreams.map(u => ({ id: u.id, repo: u.repo, commit: u.commit })),
    firstKillDay: firstDay, stableCreatures: stable.size,
    worlds,
  };
  files.set('index.json', index);
  files.set('monthly.json', { note: 'Per world and month (kill days): [month, directCoins, npcPotential, kills, killsValued, days with data, days of the month within the world\'s data]. For cross-world comparison without loading every daily file.', worlds: monthly });
  files.set('creatures.json', { note: 'Each valued creature (TibiaWiki loot page id) and its samples: effective date, availability, values per kill.', creatures: creaturesOut });
  return files;
}

const render = v => JSON.stringify(v) + '\n';

function main() {
  const args = process.argv.slice(2);
  const i = args.indexOf('--as-of');
  const asOf = i >= 0 ? args[i + 1] : null;
  const files = buildGold({ asOf });
  const out = asOf ? join(ROOT, '.cache/economy/gold-pit', asOf.replace(/[:]/g, '')) : GOLD;
  if (args.includes('--check')) {
    const stale = [...files].filter(([p, v]) => !existsSync(join(out, p)) || readFileSync(join(out, p), 'utf8') !== render(v)).map(([p]) => p);
    if (stale.length) { console.error(`stale: ${stale.slice(0, 5).join(', ')}${stale.length > 5 ? ` and ${stale.length - 5} more` : ''}`); process.exit(1); }
    console.log(`${out} is current (${files.size} files)`);
    return;
  }
  rmSync(out, { recursive: true, force: true });
  for (const [p, v] of files) { mkdirSync(join(out, p, '..'), { recursive: true }); writeFileSync(join(out, p), render(v)); }
  if (!asOf) {
    // The version log: every latest-evidence build that reached main, with what it was built from.
    const logPath = join(ROOT, 'data/economy/gold-versions.json');
    const log = existsSync(logPath) ? readJson(logPath) : { format: 1, note: 'Each derived version of data/economy/gold/: methodology, evidence vintage, kill commits and code. Earlier versions stay reproducible from git history and the append-only evidence.', versions: [] };
    const index = files.get('index.json');
    const entry = { methodology: METHODOLOGY.version, evidence: index.evidence, killstats: index.killstats, indexSha256: sha256(render(index)),
      code: (() => { try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { return null; } })() };
    if (log.versions.at(-1)?.indexSha256 !== entry.indexSha256) log.versions.push(entry);
    writeFileSync(logPath, JSON.stringify(log, null, 1) + '\n');
  }
  console.log(`${out}: ${files.size} files`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
