// GuildStats and TibiaVIP, collected only where they answer normally (Stage D, permission-gated).
//
//   node tools/economy/population/collect_gated.mjs
//
// Both sites answer scripts with a Cloudflare challenge. Tibinance never circumvents one: no browser automation,
// stealth clients, reused clearance cookies or solvers. Each run makes one plain request per source and records the
// outcome in data/economy/population/access.json, which changes only when a source's status changes:
//   blocked-challenge   a challenge page (HTTP 403/503 with Cloudflare's markers): nothing collected
//   ok                  the page answered: its series are imported (GuildStats online-counter pages share the format
//                       the Wayback importer reads) into data/economy/population/<source>/live/
//   error               any other failure
// If an operator allows Tibinance (an allowlisted User-Agent, or a key stored as the repository secret
// GUILDSTATS_TOKEN or TIBIAVIP_API_KEY), the same run starts collecting without any other change.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseOnlineCounter } from './wayback_guildstats.mjs';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const OUT = join(ROOT, 'data/economy/population');
const UA = 'TibinanceResearch/1.0 (https://github.com/nesleykent/Tibinance; contact via GitHub issues)';
export const SOURCES = [
  { id: 'guildstats', url: 'https://guildstats.eu/online-counter', token: 'GUILDSTATS_TOKEN', parse: (html, at) => parseOnlineCounter(html, at) },
  { id: 'tibiavip', url: 'https://tibiavip.app/worlds', token: 'TIBIAVIP_API_KEY', parse: null },
];

export function classify(status, body, headers = {}) {
  if ((status === 403 || status === 503) && (/Just a moment|challenge-platform|cf-chl/i.test(body) || headers['cf-mitigated'] === 'challenge')) return 'blocked-challenge';
  if (status >= 200 && status < 300) return 'ok';
  return 'error';
}

async function main() {
  const accessPath = join(OUT, 'access.json');
  const access = existsSync(accessPath) ? JSON.parse(readFileSync(accessPath, 'utf8')) : { format: 1, note: 'Last known access status per source; written only when a status changes. Tibinance never circumvents bot protection.', sources: {} };
  let changed = false;
  for (const s of SOURCES) {
    const headers = { 'User-Agent': UA, ...(process.env[s.token] ? { Authorization: `Bearer ${process.env[s.token]}` } : {}) };
    let status, body = '', h = {};
    try { const r = await fetch(s.url, { headers }); status = r.status; body = await r.text(); h = Object.fromEntries(r.headers); } catch (e) { status = 0; body = String(e); }
    const result = classify(status, body, h);
    const at = new Date().toISOString();
    if (access.sources[s.id]?.status !== result) { access.sources[s.id] = { status: result, since: at, httpStatus: status, url: s.url }; changed = true; }
    if (result === 'ok' && s.parse) {
      const rows = s.parse(body, at);
      mkdirSync(join(OUT, s.id, 'live'), { recursive: true });
      writeFileSync(join(OUT, s.id, 'live', `${at.slice(0, 13)}.json`), JSON.stringify({ format: 1, source: s.id, capturedAt: at, availableAt: at, rows }) + '\n');
    }
    console.log(`${s.id}: ${result} (HTTP ${status})`);
  }
  if (changed) { mkdirSync(OUT, { recursive: true }); writeFileSync(accessPath, JSON.stringify(access, null, 1) + '\n'); }
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
