// GuildStats online-counter history as preserved by the Internet Archive (Stage D, a legitimate archival source).
//
//   node tools/economy/population/wayback_guildstats.mjs
//
// GuildStats (guildstats.eu) answers scripts with a Cloudflare challenge, which Tibinance does not circumvent. The
// Wayback Machine holds copies of its "online-counter" page captured over the years, for all worlds together and
// for some single worlds. Each copy embeds four series as drawn on the page at capture time:
//   24 hours at 15-minute steps   labels "HH:MM"
//   7 days at 15-minute steps     labels "D Mon HH:MM"
//   30 days hourly                labels "D Mon HH:00"
//   1 year daily                  labels "YYYY-MM-DD"
// Labels are Europe/Berlin local time: every day's minimum falls on the 10:15 label, just after the 10:00 server save
// (checked on a May 2025 copy, CEST). The daily value labelled D matches the mean of the hourly values of D - 1 to
// within 0.1%, so it is stored as that day's average online players, with the original label kept.
// Every value keeps its original sampling interval and the capture as its source; availableAt is the capture time
// (when the archive provably held it). These are sparse archived windows, not the continuous hourly history
// GuildStats keeps, which remains an unresolved requirement (docs/economy.md).
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const CACHE = join(process.env.TIBINANCE_ECONOMY_CACHE ?? join(ROOT, '.cache/economy'), 'wayback');
const OUT = join(ROOT, 'data/economy/population/guildstats-wayback');
const UA = 'TibinanceResearch/1.0 (https://github.com/nesleykent/Tibinance; archived population statistics)';
const MONTHS = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Berlin wall-clock time -> UTC ISO (CET/CEST by the EU rule: last Sunday of March and October at 01:00 UTC).
export function berlinToUtc(y, mo, d, h, mi) {
  const lastSunday = month => { const t = new Date(Date.UTC(y, month, 0)); return t.getUTCDate() - t.getUTCDay(); };
  const start = Date.UTC(y, 2, lastSunday(3), 1), end = Date.UTC(y, 9, lastSunday(10), 1);
  const local = Date.UTC(y, mo - 1, d, h, mi);
  const asSummer = local - 7200000;                              // CEST is UTC+2, CET UTC+1
  return new Date(asSummer >= start && asSummer < end ? asSummer : local - 3600000).toISOString();
}

export function utcToBerlinParts(iso) {
  const t = new Date(iso);
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const p = Object.fromEntries(f.formatToParts(t).map(x => [x.type, x.value]));
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour, mi: +p.minute };
}

// Parses one archived page: its four series with labels resolved to UTC instants (walking back from the capture).
export function parseOnlineCounter(html, capturedAt) {
  const blocks = [...html.matchAll(/arrayToDataTable\(\[([\s\S]*?)\]\);/g)].map(m => [...m[1].matchAll(/\['([^']+)',\s*(\d+)\]/g)].map(x => [x[1], Number(x[2])]));
  const cap = utcToBerlinParts(capturedAt);
  const out = [];
  for (const rows of blocks) {
    if (!rows.length) continue;
    const label = rows[0][0];
    if (/^\d{4}-\d{2}-\d{2}$/.test(label)) {
      for (const [l, v] of rows) {
        const [y, mo, d] = l.split('-').map(Number);
        const day = new Date(Date.UTC(y, mo - 1, d) - 86400000).toISOString().slice(0, 10);
        out.push({ series: 'daily-average', label: l, day, interval: 'P1D', value: v });
      }
      continue;
    }
    const withDate = /^\d{1,2} [A-Z][a-z]{2} \d{2}:\d{2}$/.test(label);
    // Walk back from the capture so each label gets its year (and, for HH:MM labels, its day).
    let y = cap.y, mo = cap.mo, d = cap.d;
    let prevMinutes = Infinity;
    const resolved = [];
    for (let i = rows.length - 1; i >= 0; i--) {
      const [l, v] = rows[i];
      let h, mi;
      if (withDate) {
        const [dd, mon, hm] = l.split(' ');
        [h, mi] = hm.split(':').map(Number);
        const lmo = MONTHS[mon];
        if (lmo > mo + 1) y -= 1;                         // crossing back over a new year
        mo = lmo; d = Number(dd);
      } else {
        [h, mi] = l.split(':').map(Number);
        const minutes = h * 60 + mi;
        if (minutes > prevMinutes) { const t = new Date(Date.UTC(y, mo - 1, d) - 86400000); y = t.getUTCFullYear(); mo = t.getUTCMonth() + 1; d = t.getUTCDate(); }
        prevMinutes = minutes;
      }
      resolved.push({ label: l, at: berlinToUtc(y, mo, d, h, mi), value: v });
    }
    resolved.reverse();
    const step = (Date.parse(resolved[1]?.at) - Date.parse(resolved[0].at)) / 60000;
    const interval = step === 60 ? 'PT1H' : 'PT15M';
    for (const r of resolved) out.push({ series: interval === 'PT1H' ? 'hourly' : withDate ? '7-day' : '24-hour', label: r.label, at: r.at, interval, value: r.value });
  }
  return out;
}

async function get(url) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const r = await fetch(url, { headers: { 'User-Agent': UA } });
    if (r.ok) return r;
    if (r.status === 429 || r.status >= 500) { await sleep(10000 * (attempt + 1)); continue; }
    throw new Error(`${url}: HTTP ${r.status}`);
  }
  throw new Error(`${url}: the archive kept failing`);
}

export async function importWayback({ log = console.log } = {}) {
  const cdx = await (await get(`https://web.archive.org/cdx/search/cdx?${new URLSearchParams({ url: 'guildstats.eu/online-counter', matchType: 'prefix', output: 'json', filter: 'statuscode:200', fl: 'timestamp,original,digest', collapse: 'digest' })}`)).json();
  const captures = cdx.slice(1).map(([timestamp, original, digest]) => ({ timestamp, original, digest }));
  mkdirSync(CACHE, { recursive: true });
  const byScope = new Map();
  let fetched = 0;
  for (const c of captures) {
    const path = join(CACHE, `${c.timestamp}-${c.digest}.html.gz`);
    let html;
    if (existsSync(path)) html = gunzipSync(readFileSync(path)).toString();
    else {
      await sleep(fetched++ ? 1500 : 0);
      html = await (await get(`https://web.archive.org/web/${c.timestamp}id_/${c.original}`)).text();
      writeFileSync(path, gzipSync(html));
    }
    const u = new URL(c.original.replace(/^http:/, 'https:'));
    const world = u.searchParams.get('world') || (u.pathname.split('/')[2] ?? '') || null;
    const scope = world ? world : 'all-worlds';
    const ts = c.timestamp;
    const capturedAt = `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}T${ts.slice(8, 10)}:${ts.slice(10, 12)}:${ts.slice(12, 14)}Z`;
    const rows = parseOnlineCounter(html, capturedAt);
    if (!rows.length) continue;
    const source = { capture: ts, url: c.original, archive: `https://web.archive.org/web/${ts}/${c.original}`, digest: c.digest, sha256: createHash('sha256').update(html).digest('hex') };
    if (!byScope.has(scope)) byScope.set(scope, []);
    byScope.get(scope).push({ capturedAt, source, rows });
  }
  mkdirSync(OUT, { recursive: true });
  const summary = [];
  for (const [scope, caps] of [...byScope].sort()) {
    const observations = [];
    const seen = new Map();
    for (const cap of caps.sort((a, b) => (a.capturedAt < b.capturedAt ? -1 : 1))) {
      for (const r of cap.rows) {
        const key = `${r.series} ${r.at ?? r.day}`;
        const prior = seen.get(key);
        if (prior && prior.value === r.value) { prior.captures.push(cap.source.capture); continue; }
        const o = { metric: r.series === 'daily-average' ? 'players-online-daily-average' : 'players-online', series: r.series,
          ...(r.at ? { observedAt: r.at } : { day: r.day }), label: r.label, interval: r.interval, value: r.value,
          availableAt: cap.capturedAt, availability: 'exact', captures: [cap.source.capture], ...(prior ? { differsFromCapture: prior.captures[0] } : {}) };
        seen.set(key, o);
        observations.push(o);
      }
    }
    const doc = { format: 1, source: 'guildstats-wayback', scope, definition: 'Players online as counted by GuildStats (characters online on tibia.com), copied from archived GuildStats pages. 15-minute and hourly values are counts at the labelled time; daily values are the average of the previous day. Times are UTC, converted from Berlin labels.',
      captures: caps.map(c => c.source), coverage: { first: observations.map(o => o.observedAt ?? o.day).sort()[0], last: observations.map(o => o.observedAt ?? o.day).sort().at(-1),
        bySeries: Object.fromEntries(['24-hour', '7-day', 'hourly', 'daily-average'].map(s => [s, observations.filter(o => o.series === s).length])) }, observations };
    writeFileSync(join(OUT, `${scope.toLowerCase()}.json`), JSON.stringify(doc) + '\n');
    summary.push({ scope, captures: caps.length, ...doc.coverage });
    log(`${scope}: ${caps.length} captures, ${observations.length} observations`);
  }
  return { captures: captures.length, scopes: summary };
}

if (import.meta.url === `file://${process.argv[1]}`) console.log(JSON.stringify(await importWayback(), null, 1));
