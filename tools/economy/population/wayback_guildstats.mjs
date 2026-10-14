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

const DAILY = /^\d{4}-\d{2}-\d{2}$/;
const FORMATS = [
  { re: /^\d{4}-\d{2}-\d{2} \d{1,2}:\d{2}$/, kind: 'datetime' },  // 2015-01-19 05:45 (older pages)
  { re: /^\d{1,2} [A-Z][a-z]{2} \d{1,2}:\d{2}$/, kind: 'day-month-time' }, // 11 May 18:45
  { re: /^\d{1,2}:\d{2}$/, kind: 'time' },                           // 18:45 (the last 24 hours)
];

// Parses one archived page: every series with labels resolved to UTC instants (walking back from the capture for
// labels without a year or a day). A daily series' meaning is verified against the page's own intraday values;
// unknown label formats are skipped and reported, never guessed.
export function parseOnlineCounter(html, capturedAt) {
  const blocks = [...html.matchAll(/arrayToDataTable\(\[([\s\S]*?)\]\);/g)].map(m => [...m[1].matchAll(/\['([^']+)',\s*(\d+)\]/g)].map(x => [x[1], Number(x[2])]));
  const cap = utcToBerlinParts(capturedAt);
  const out = [], skipped = [], daily = [];
  for (const rows of blocks) {
    if (!rows.length) continue;
    const label = rows[0][0];
    if (DAILY.test(label)) { daily.push(rows); continue; }
    const format = FORMATS.find(f => f.re.test(label) && rows.every(([l]) => f.re.test(l)));
    if (!format) { skipped.push(label); continue; }
    let y = cap.y, mo = cap.mo, d = cap.d, prevMinutes = Infinity;
    const resolved = [];
    for (let i = rows.length - 1; i >= 0; i--) {
      const [l, v] = rows[i];
      let h, mi;
      if (format.kind === 'datetime') {
        const [date, hm] = l.split(' ');
        [y, mo, d] = date.split('-').map(Number);
        [h, mi] = hm.split(':').map(Number);
      } else if (format.kind === 'day-month-time') {
        const [dd, mon, hm] = l.split(' ');
        [h, mi] = hm.split(':').map(Number);
        const lmo = MONTHS[mon];
        if (!lmo) { resolved.length = 0; break; }
        if (lmo > mo + 1) y -= 1;
        mo = lmo; d = Number(dd);
      } else {
        [h, mi] = l.split(':').map(Number);
        const minutes = h * 60 + mi;
        if (minutes > prevMinutes) { const t = new Date(Date.UTC(y, mo - 1, d) - 86400000); y = t.getUTCFullYear(); mo = t.getUTCMonth() + 1; d = t.getUTCDate(); }
        prevMinutes = minutes;
      }
      resolved.push({ label: l, at: berlinToUtc(y, mo, d, h, mi), value: v });
    }
    if (!resolved.length) { skipped.push(label); continue; }
    resolved.reverse();
    // Each block is its own series. Its interval is the dominant gap between labels when nine gaps in ten equal it
    // (a sample missing around a server save stays a gap); otherwise the series is irregular and keeps each gap.
    const gaps = resolved.slice(1).map((r, i) => Math.round((Date.parse(r.at) - Date.parse(resolved[i].at)) / 60000));
    const mode = [...gaps.reduce((m, g) => m.set(g, (m.get(g) ?? 0) + 1), new Map())].sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
    const regular = gaps.length && mode[1] >= 0.9 * gaps.length && (mode[0] === 15 || mode[0] === 60);
    const interval = regular ? (mode[0] === 60 ? 'PT1H' : 'PT15M') : 'irregular';
    const series = !regular ? `intraday-irregular-${blocks.indexOf(rows)}` : interval === 'PT1H' ? 'hourly' : format.kind === 'time' ? '24-hour' : '7-day';
    resolved.forEach((r, i) => out.push({ series, label: r.label, at: r.at, interval, value: r.value, ...(interval === 'irregular' ? { gapMinutes: gaps[i] ?? null } : {}) }));
  }
  // What an hourly value is: the count at the label, or the average of the hour ending at the label, checked against
  // the page's own 15-minute samples (median relative error under 3%); otherwise unverified.
  const fine = new Map(out.filter(r => r.interval === 'PT15M').map(r => [r.at, r.value]));
  const hourly = out.filter(r => r.series === 'hourly');
  if (hourly.length && fine.size) {
    const med = xs => (xs.sort((a, b) => a - b), xs[Math.floor(xs.length / 2)]);
    const instant = [], ending = [];
    for (const r of hourly) {
      const t = Date.parse(r.at), at = k => fine.get(new Date(t - k * 900000).toISOString());
      if (at(0) !== undefined) instant.push(Math.abs(at(0) / r.value - 1));
      const window = [3, 2, 1, 0].map(at);
      if (window.every(v => v !== undefined)) ending.push(Math.abs(window.reduce((a, b) => a + b, 0) / 4 / r.value - 1));
    }
    const mi = instant.length >= 24 ? med(instant) : Infinity, me = ending.length >= 24 ? med(ending) : Infinity;
    const meaning = Math.min(mi, me) < 0.03 ? (me <= mi ? 'average-of-the-hour-ending-at-label' : 'count-at-label') : 'unverified';
    for (const r of hourly) r.meaning = meaning;
    (out.hourlyChecks ??= []).push({ meaning, medianErrorInstant: Number.isFinite(mi) ? Number(mi.toFixed(4)) : null, medianErrorHourEnding: Number.isFinite(me) ? Number(me.toFixed(4)) : null });
  }
  // Daily series: what a value labelled D means, checked against the intraday values of the same page.
  // One resolution only (hourly when the page has it, else its longest intraday series), so a day's mean is not
  // weighted by overlapping 15-minute windows.
  const counts = new Map();
  for (const r of out) counts.set(r.series, (counts.get(r.series) ?? 0) + 1);
  const reference = counts.has('hourly') ? 'hourly' : [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
  const intraday = new Map();
  for (const r of out.filter(x => x.series === reference)) {
    const p = utcToBerlinParts(r.at), day = `${p.y}-${String(p.mo).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
    if (!intraday.has(day)) intraday.set(day, []);
    intraday.get(day).push(r.value);
  }
  const full = [...intraday].filter(([, v]) => v.length >= 24);
  for (const rows of daily) {
    const shift = (iso, k) => new Date(Date.parse(`${iso}T00:00:00Z`) + k * 86400000).toISOString().slice(0, 10);
    const tests = { 'previous-day-average': [l => shift(l, -1), v => v.reduce((a, b) => a + b, 0) / v.length], 'same-day-average': [l => l, v => v.reduce((a, b) => a + b, 0) / v.length],
      'previous-day-peak': [l => shift(l, -1), v => Math.max(...v)], 'same-day-peak': [l => l, v => Math.max(...v)] };
    // The hypothesis with the smallest median relative error over the days the page covers both ways, accepted
    // when that median is under 1% on at least three days; otherwise the series stays unverified.
    let meaning = 'unverified', best = Infinity, check = null;
    for (const [name, [dayOf, stat]] of Object.entries(tests)) {
      const errors = rows.map(([l, v]) => { const values = full.find(([d]) => d === dayOf(l))?.[1]; return values ? Math.abs(stat(values) / v - 1) : null; })
        .filter(e => e !== null).sort((a, b) => a - b);
      if (errors.length < 3) continue;
      const median = errors[Math.floor(errors.length / 2)];
      if (median < 0.01 && median < best) { meaning = name; best = median; check = { days: errors.length, medianRelativeError: Number(median.toFixed(5)), within1pct: errors.filter(e => e < 0.01).length }; }
    }
    (out.dailyChecks ??= []).push({ series: rows[0][0], meaning, check });
    for (const [l, v] of rows) {
      const day = meaning.startsWith('previous-day') ? shift(l, -1) : l;
      out.push({ series: meaning === 'unverified' ? 'daily-unverified' : meaning.endsWith('peak') ? 'daily-peak' : 'daily-average', label: l, day, interval: 'P1D', value: v, meaning });
    }
  }
  out.skipped = skipped;
  out.dailyChecks ??= [];
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
  let fetched = 0, skippedCaptures;
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
    let rows;
    try { rows = parseOnlineCounter(html, capturedAt); } catch (e) { (skippedCaptures ??= []).push({ capture: c.timestamp, reason: e.message }); continue; }
    if (rows.skipped?.length) (skippedCaptures ??= []).push({ capture: c.timestamp, reason: `unknown label formats: ${rows.skipped.join(', ')}` });
    if (!rows.length) continue;
    const source = { capture: ts, url: c.original, archive: `https://web.archive.org/web/${ts}/${c.original}`, digest: c.digest, sha256: createHash('sha256').update(html).digest('hex') };
    if (!byScope.has(scope)) byScope.set(scope, []);
    byScope.get(scope).push({ capturedAt, source, rows });
  }
  mkdirSync(OUT, { recursive: true });
  const summary = [];
  for (const [scope, caps] of [...byScope].sort()) {
    caps.sort((a, b) => (a.capturedAt < b.capturedAt ? -1 : 1));
    const series = new Map(), conflicts = [];
    caps.forEach((cap, ci) => {
      for (const r of cap.rows) {
        // A series is one kind of block with one meaning: a capture whose page shows a different (or no verifiable)
        // meaning goes to its own series rather than mixing.
        const key = `${r.series}|${r.meaning ?? ''}`;
        if (!series.has(key)) series.set(key, { series: r.series, interval: r.interval, meaning: r.meaning ?? null, points: new Map() });
        const s = series.get(key), t = r.at ?? r.day, prior = s.points.get(t);
        // A later capture showing another value for the same time is a revision by the source: the first captured
        // value stays the point (it was available first), every revision is kept with its capture.
        if (prior) { if (prior[1] !== r.value) conflicts.push({ series: r.series, meaning: r.meaning ?? null, time: t, values: [prior[1], r.value], captures: [caps[prior[2]].source.capture, cap.source.capture] }); continue; }
        s.points.set(t, [t, r.value, ci, ...(r.gapMinutes !== undefined ? [r.gapMinutes] : [])]);
      }
    });
    const list = [...series.values()].map(s => ({ ...s, points: [...s.points.values()].sort((a, b) => (a[0] < b[0] ? -1 : 1)) }));
    const all = list.flatMap(s => s.points.map(p => p[0])).sort();
    const doc = { format: 2, source: 'guildstats-wayback', scope,
      definition: 'Players online as counted by GuildStats (characters online on tibia.com), copied from archived GuildStats pages. Points are [UTC time or day, value, capture index, gap to the next point in minutes for irregular series]. Intraday values are counts at that time; daily-average is the average of the day (labelled one day later on the page); daily-unverified means the page did not show what its daily value measures. availableAt of a point is its capture time.',
      captures: caps.map(c => ({ ...c.source, capturedAt: c.capturedAt })), coverage: { first: all[0], last: all.at(-1), bySeries: Object.fromEntries(list.map(s => [`${s.series}${s.meaning ? ` (${s.meaning})` : ''}`, s.points.length])) },
      revisions: conflicts, series: list };
    writeFileSync(join(OUT, `${scope.toLowerCase()}.json`), JSON.stringify(doc) + '\n');
    summary.push({ scope, captures: caps.length, ...doc.coverage, revisions: conflicts.length });
    log(`${scope}: ${caps.length} captures, ${list.reduce((n, s) => n + s.points.length, 0)} points, ${conflicts.length} later revisions kept`);
  }
  writeFileSync(join(OUT, 'index.json'), JSON.stringify({ format: 1, source: 'guildstats-wayback', captures: captures.length, skippedCaptures: skippedCaptures ?? [], scopes: summary }, null, 1) + '\n');
  return { captures: captures.length, skipped: (skippedCaptures ?? []).length, scopes: summary };
}

if (import.meta.url === `file://${process.argv[1]}`) console.log(JSON.stringify(await importWayback(), null, 1));
