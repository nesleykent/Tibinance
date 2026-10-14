// Kill-statistics race names -> TibiaWiki creatures with loot evidence (Stage C3).
//
//   node tools/economy/map_creatures.mjs
//
// A race is the name TibiaData reports in kill statistics ("dragon lords", "Abyssador", "(elemental forces)").
// It is matched to the creature whose "Loot Statistics:" page holds its loot samples, in this order, the first
// match winning and its method recorded:
//   override      data/economy/inputs/creature-map-overrides.json, reviewed by hand (the only hand-made input;
//                 an override may also say a race is not a lootable creature)
//   normalized    the upstream normalisation map (tibiamaps/tibia-kill-stats normalize-names.mjs, at the pinned
//                 commit) gives the creature name, which equals a loot page title ignoring case
//   exact         the race itself equals a loot page title ignoring case
//   redirect      the creature name redirects on TibiaWiki (a renamed creature) to a creature with a loot page
//   singularized  an English plural left in the name (wolves, marksmen, reavers) singularised by fixed rules, accepted
//                 only when exactly one loot page matches; names shared by several creatures (nomads, butterflies:
//                 one race for several variants) stay unmatched rather than borrow one variant's loot
// Anything else is unmatched and stays unvalued: its kills count in kill coverage, never in valued totals.
// The stable creature id is the loot page's page id. Unmatched races are listed with their total kills.
import { existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { unpackPartition } from '../../js/economy-killstats.js';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const CACHE = process.env.TIBINANCE_ECONOMY_CACHE ?? join(ROOT, '.cache/economy');
const SOURCES = join(ROOT, 'data/economy/sources');
const UA = 'TibinanceResearch/1.0 (https://github.com/nesleykent/Tibinance; economic indicators from public loot statistics)';
const readJson = (p, f) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : f);
const key = s => s.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();

// [killStatsName, prettyName] pairs of the upstream normalisation map.
export function parseNormalizeMap(source) {
  const pairs = new Map();
  for (const m of source.matchAll(/\[\s*(['"])((?:\\.|(?!\1).)*)\1\s*,\s*(['"])((?:\\.|(?!\3).)*)\3\s*\]/g)) {
    const unescape = s => s.replace(/\\(.)/g, '$1');
    pairs.set(unescape(m[2]), unescape(m[4]));
  }
  return pairs;
}

export function matchRaces(races, { normalize, lootTitles, redirects = new Map(), overrides = {} }) {
  const pages = new Map(lootTitles.map(p => [key(p.title.replace(/^Loot Statistics:/, '')), p]));
  return races.map((race, raceId) => {
    const o = overrides[race];
    if (o) {
      if (o.creature === null) return { race, raceId, creature: null, pageId: null, method: 'override', note: o.note ?? 'not a lootable creature' };
      const p = pages.get(key(o.creature));
      return { race, raceId, creature: p ? p.title.replace(/^Loot Statistics:/, '') : o.creature, pageId: p?.pageid ?? null, method: 'override', note: o.note ?? null };
    }
    const pretty = normalize.get(race) ?? null;
    for (const [name, method] of [[pretty, 'normalized'], [race, 'exact']]) {
      if (!name) continue;
      const p = pages.get(key(name));
      if (p) return { race, raceId, creature: p.title.replace(/^Loot Statistics:/, ''), pageId: p.pageid, method, pretty };
    }
    for (const name of [pretty, race].filter(Boolean)) {
      const target = redirects.get(key(name));
      const p = target && pages.get(key(target));
      if (p) return { race, raceId, creature: p.title.replace(/^Loot Statistics:/, ''), pageId: p.pageid, method: 'redirect', pretty, redirectedFrom: name };
    }
    for (const name of [pretty, race].filter(Boolean)) {
      const hits = [...new Set(singulars(name).map(n => pages.get(key(n))).filter(Boolean))];
      if (hits.length === 1) return { race, raceId, creature: hits[0].title.replace(/^Loot Statistics:/, ''), pageId: hits[0].pageid, method: 'singularized', pretty, singularizedFrom: name };
    }
    return { race, raceId, creature: null, pageId: null, method: 'unmatched', pretty };
  });
}

// Singular candidates of a plural English name, changing only its last word.
export function singulars(name) {
  const words = name.split(' '), last = words.at(-1), stem = words.slice(0, -1).join(' ');
  const forms = new Set();
  const rules = [[/men$/, 'man'], [/ves$/, 'f'], [/ves$/, 'fe'], [/ies$/, 'y'], [/(ch|sh|ss|x|z)es$/, '$1'], [/i$/, 'us'], [/s$/, '']];
  for (const [re, to] of rules) if (re.test(last)) forms.add([stem, last.replace(re, to)].filter(Boolean).join(' '));
  forms.delete(name);
  return [...forms];
}

async function resolveRedirects(names) {
  const out = new Map();
  for (let i = 0; i < names.length; i += 50) {
    const titles = names.slice(i, i + 50).map(n => n.replace(/^./, c => c.toUpperCase()));
    const url = `https://tibia.fandom.com/api.php?${new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', redirects: '1', titles: titles.join('|') })}`;
    const body = await (await fetch(url, { headers: { 'User-Agent': UA } })).json();
    const norm = new Map((body.query?.normalized ?? []).map(n => [n.from, n.to]));
    for (const r of body.query?.redirects ?? []) out.set(key(r.from), r.to);
    for (const t of titles) { const n = norm.get(t); if (n && out.has(key(n))) out.set(key(t), out.get(key(n))); }
    await new Promise(r => setTimeout(r, 700));
  }
  return out;
}

function totalKills() {
  const totals = new Map();
  const dir = join(CACHE, 'killstats');
  if (!existsSync(dir)) return totals;
  for (const world of readdirSync(dir)) for (const f of readdirSync(join(dir, world))) {
    for (const day of unpackPartition(gunzipSync(readFileSync(join(dir, world, f)))).days) for (const [race, killed] of day.rows) totals.set(race, (totals.get(race) ?? 0) + killed);
  }
  return totals;
}

async function main() {
  const races = readJson(join(SOURCES, 'races.json'), null)?.races;
  const killstats = readJson(join(SOURCES, 'killstats.json'), null);
  const lootTitles = readJson(join(CACHE, 'wiki', 'pages.json'), null);
  if (!races || !killstats || !lootTitles) throw new Error('run ingest_killstats.mjs and fetch_loot.mjs first');
  const commit = killstats.upstreams.find(u => u.id === 'current').commit;
  const source = execFileSync('gh', ['api', `repos/tibiamaps/tibia-kill-stats/contents/normalize-names.mjs?ref=${commit}`, '-H', 'Accept: application/vnd.github.raw'], { encoding: 'utf8', maxBuffer: 1 << 26 });
  const normalize = parseNormalizeMap(source);
  const overrides = readJson(join(ROOT, 'data/economy/inputs/creature-map-overrides.json'), { overrides: {} }).overrides;
  const first = matchRaces(races, { normalize, lootTitles, overrides });
  const redirects = await resolveRedirects([...new Set(first.filter(m => m.method === 'unmatched').flatMap(m => [m.pretty, m.race]).filter(Boolean))]);
  const mapped = matchRaces(races, { normalize, lootTitles, redirects, overrides });
  const kills = totalKills();
  const total = [...kills.values()].reduce((s, v) => s + v, 0);
  const matchedKills = mapped.filter(m => m.pageId).reduce((s, m) => s + (kills.get(m.raceId) ?? 0), 0);
  const out = {
    format: 1,
    note: 'Kill-statistics races matched to TibiaWiki creatures with Loot Statistics pages. method: override, normalized (upstream normalisation map), exact, redirect, unmatched. Unmatched races are never valued.',
    normalizeSource: { repo: 'tibiamaps/tibia-kill-stats', path: 'normalize-names.mjs', commit, pairs: normalize.size },
    summary: { races: mapped.length, matched: mapped.filter(m => m.pageId).length, kills: total, matchedKills,
      byMethod: Object.fromEntries(['override', 'normalized', 'exact', 'redirect', 'singularized', 'unmatched'].map(k => [k, mapped.filter(m => m.method === k).length])) },
    unmatchedByKills: mapped.filter(m => !m.pageId).map(m => ({ race: m.race, kills: kills.get(m.raceId) ?? 0, method: m.method, note: m.note ?? null }))
      .sort((a, b) => b.kills - a.kills),
    races: mapped,
  };
  writeFileSync(join(SOURCES, 'creature-map.json'), JSON.stringify(out, null, 1) + '\n');
  console.log(JSON.stringify(out.summary), 'top unmatched:', out.unmatchedByKills.slice(0, 10).map(u => `${u.race} ${u.kills}`).join('; '));
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
