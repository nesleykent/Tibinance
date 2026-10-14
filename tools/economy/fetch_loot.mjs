// TibiaWiki loot evidence with its revision history (corrections 1, 8 and 11).
//
//   node tools/economy/fetch_loot.mjs            fetch new revisions, append new evidence
//   node tools/economy/fetch_loot.mjs --offline  rebuild the evidence from the cached revisions only
//
// Sources (CC-BY-SA, TibiaWiki contributors, via the MediaWiki API with a descriptive User-Agent, one request at a
// time, maxlag=5, up to 50 revisions per content request): every "Loot Statistics:" page (namespace 112), Module:ItemPrices/data, and the Updates/<version>
// pages. For each loot page and for ItemPrices it keeps the revision that was current on 2022-08-23 (the first day of
// kill statistics) and every later revision, so any point in time since then can be reconstructed.
//
// Evidence (data/economy/sources/loot/, append-only chunks, never rewritten):
//   sample        one distinct {{Loot2}} sample content of a page: pageId, title, sampleKey (page, version, ordinal),
//                 version, kills, lines, contentSha256, the revision that first holds it (revId, revTimestamp =
//                 availableAt) and whether that is exact or an upper bound (it was already in the 2022-08-23
//                 revision, so it was available before then)
//   sample-ended  a later revision no longer holds that exact content (edited or removed): revId, revTimestamp
//   prices        one ItemPrices vintage: revId, revTimestamp (= availableAt), contentSha256 and its changes since the
//                 previous vintage (item -> highest NPC buy price, null when no longer bought)
// A retroactive correction of a sample under the same version is a new sample record plus a sample-ended record for
// the old content; nothing is overwritten. data/economy/sources/versions.json maps each client version to its
// release date (effectiveAt; public at release, so availableAt is the same date).
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseLootPage, parseItemPrices } from '../../js/economy-loot.js';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const CACHE = join(process.env.TIBINANCE_ECONOMY_CACHE ?? join(ROOT, '.cache/economy'), 'wiki');
const OUT = join(ROOT, 'data/economy/sources');
const API = 'https://tibia.fandom.com/api.php';
const UA = 'TibinanceResearch/1.0 (https://github.com/nesleykent/Tibinance; economic indicators from public loot statistics)';
export const BASE = '2022-08-23T00:00:00Z';
const PRICES_TITLE = 'Module:ItemPrices/data';
const sha256 = s => createHash('sha256').update(s).digest('hex');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const readJson = (p, f) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : f);
let requests = 0;

async function api(params) {
  const url = `${API}?${new URLSearchParams({ format: 'json', formatversion: '2', maxlag: '5', ...params })}`;
  for (let attempt = 0; attempt < 6; attempt++) {
    requests++;  // serial requests (MediaWiki etiquette); maxlag and back-off below keep the load polite
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
    if (r.status === 429 || r.status >= 500) { await sleep(5000 * (attempt + 1)); continue; }
    const body = await r.json();
    if (body.error?.code === 'maxlag') { await sleep(5000 * (attempt + 1)); continue; }
    if (body.error) throw new Error(`${params.action}: ${body.error.code} ${body.error.info}`);
    return body;
  }
  throw new Error(`MediaWiki API kept failing: ${url}`);
}

async function allPages(params) {
  const out = [];
  let cont = {};
  do {
    const body = await api({ action: 'query', list: 'allpages', aplimit: '500', ...params, ...cont });
    out.push(...body.query.allpages);
    cont = body.continue ?? null;
  } while (cont);
  return out;
}

// Revision metadata of one page: the revision current at BASE (if the page existed) and every later one.
async function revisionList(pageid) {
  const before = await api({ action: 'query', prop: 'revisions', pageids: String(pageid), rvprop: 'ids|timestamp|sha1', rvlimit: '1', rvdir: 'older', rvstart: BASE });
  const after = [];
  let cont = {};
  do {
    const body = await api({ action: 'query', prop: 'revisions', pageids: String(pageid), rvprop: 'ids|timestamp|sha1', rvlimit: '500', rvdir: 'newer', rvstart: BASE, ...cont });
    after.push(...(body.query.pages[0].revisions ?? []));
    cont = body.continue ?? null;
  } while (cont);
  const base = before.query.pages[0].revisions?.[0];
  return [...(base ? [{ ...base, baseline: true }] : []), ...after];
}

async function contents(revids, batch = 50) {
  const out = new Map();
  for (let i = 0; i < revids.length; i += batch) {
    const body = await api({ action: 'query', prop: 'revisions', revids: revids.slice(i, i + batch).join('|'), rvprop: 'ids|content', rvslots: 'main' });
    for (const p of body.query.pages) for (const r of p.revisions ?? []) out.set(r.revid, r.slots.main.content ?? '');
  }
  return out;
}

// One page's cached history: {pageid, title, lastrevid, revisions: [{revid, timestamp, sha1, baseline, content}]}.
async function pageHistory(page, latest, offline) {
  const path = join(CACHE, 'pages', `${page.pageid}.json.gz`);
  const cached = existsSync(path) ? JSON.parse(gunzipSync(readFileSync(path))) : null;
  if (offline || (cached && cached.lastrevid === latest)) return cached;
  const list = await revisionList(page.pageid);
  const have = new Map((cached?.revisions ?? []).map(r => [r.revid, r]));
  const bySha = new Map((cached?.revisions ?? []).map(r => [r.sha1, r.content]));
  const need = list.filter(r => !have.has(r.revid) && !(r.sha1 && bySha.has(r.sha1))).map(r => r.revid);
  const fetched = await contents(need, page.title === PRICES_TITLE ? 2 : 50);  // ItemPrices revisions are ~820 KB each
  const revisions = list.map(r => ({ revid: r.revid, timestamp: r.timestamp, sha1: r.sha1 ?? null, baseline: Boolean(r.baseline),
    content: have.get(r.revid)?.content ?? fetched.get(r.revid) ?? (r.sha1 ? bySha.get(r.sha1) : undefined) ?? '' }));
  const history = { pageid: page.pageid, title: page.title, lastrevid: latest, revisions };
  mkdirSync(join(CACHE, 'pages'), { recursive: true });
  writeFileSync(path, gzipSync(JSON.stringify(history)));
  return history;
}

// Sample evidence of one page history: each distinct content once, with the revision that first holds it, and an
// ended event at the first later revision that no longer holds it.
export function sampleEvidence(history) {
  const records = [];
  let live = new Map(); // contentSha256 -> record
  for (const rev of history.revisions) {
    const samples = parseLootPage(rev.content);
    const ordinals = new Map();
    const now = new Map();
    for (const s of samples) {
      const ordinal = ordinals.get(s.version) ?? 0;
      ordinals.set(s.version, ordinal + 1);
      const body = { version: s.version, kills: s.kills, name: s.name, manualAlv: s.manualAlv, lines: s.lines.map(({ quirks, ...l }) => l), quirks: s.quirks };
      const contentSha256 = sha256(JSON.stringify(body));
      const sampleKey = `${history.pageid}:${s.version}:${ordinal}`;
      now.set(contentSha256, true);
      if (!live.has(contentSha256)) {
        const record = { type: 'sample', pageId: history.pageid, title: history.title, sampleKey, contentSha256, ...body,
          revId: rev.revid, revTimestamp: rev.timestamp, availability: rev.baseline ? 'upper-bound' : 'exact',
          availableAt: rev.timestamp, provenance: `https://tibia.fandom.com/wiki/Special:PermanentLink/${rev.revid}` };
        records.push(record);
        live.set(contentSha256, record);
      }
    }
    for (const [hash, record] of live) {
      if (!now.has(hash)) {
        records.push({ type: 'sample-ended', pageId: history.pageid, sampleKey: record.sampleKey, contentSha256: hash, revId: rev.revid, revTimestamp: rev.timestamp });
        live.delete(hash);
      }
    }
  }
  return records;
}

export function priceEvidence(history) {
  const records = [];
  let previous = new Map();
  for (const rev of history.revisions) {
    const prices = parseItemPrices(rev.content);
    const changes = {};
    for (const [item, price] of prices) if (previous.get(item) !== price) changes[item] = price;
    for (const item of previous.keys()) if (!prices.has(item)) changes[item] = null;
    if (Object.keys(changes).length || !records.length) {
      records.push({ type: 'prices', revId: rev.revid, revTimestamp: rev.timestamp, availableAt: rev.timestamp,
        availability: rev.baseline ? 'upper-bound' : 'exact', contentSha256: sha256(rev.content), items: prices.size, changes });
    }
    previous = prices;
  }
  return records;
}

const keyOf = r => `${r.type} ${r.pageId ?? ''} ${r.contentSha256} ${r.revId}`;

// Appends records not yet in the committed chunks as a new immutable chunk; a committed record never changes.
function appendEvidence(dir, records) {
  mkdirSync(dir, { recursive: true });
  const chunks = readdirSync(dir).filter(f => /^chunk-\d{4}\.jsonl\.gz$/.test(f)).sort();
  const existing = new Set();
  for (const c of chunks) for (const line of gunzipSync(readFileSync(join(dir, c))).toString().split('\n').filter(Boolean)) existing.add(keyOf(JSON.parse(line)));
  const fresh = records.filter(r => !existing.has(keyOf(r)));
  if (!fresh.length) return { chunk: null, added: 0, total: existing.size };
  const name = `chunk-${String(chunks.length + 1).padStart(4, '0')}.jsonl.gz`;
  writeFileSync(join(dir, name), gzipSync(fresh.map(r => JSON.stringify(r)).join('\n') + '\n', { level: 9 }));
  const manifest = readdirSync(dir).filter(f => /^chunk-\d{4}\.jsonl\.gz$/.test(f)).sort()
    .map(f => ({ file: f, sha256: sha256(readFileSync(join(dir, f))) }));
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ format: 1, note: 'Append-only evidence chunks; a chunk never changes once committed. CC-BY-SA, TibiaWiki contributors.', chunks: manifest }, null, 1) + '\n');
  return { chunk: name, added: fresh.length, total: existing.size + fresh.length };
}

export function readEvidence(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(f => /^chunk-\d{4}\.jsonl\.gz$/.test(f)).sort()
    .flatMap(f => gunzipSync(readFileSync(join(dir, f))).toString().split('\n').filter(Boolean).map(l => JSON.parse(l)));
}

function versionFacts(text) {
  const field = k => (text.match(new RegExp(`\\|\\s*${k}\\s*=\\s*([^\\n|]*)`)) ?? [])[1]?.trim() || null;
  return { implemented: field('implemented'), date: field('date'), name: field('name'), primarytype: field('primarytype') };
}

export async function fetchLoot({ offline = false, limit = null, log = console.log } = {}) {
  let pages = offline ? readJson(join(CACHE, 'pages.json'), []) : await allPages({ apnamespace: '112' });
  if (limit) pages = pages.slice(0, limit);  // trial runs only: the evidence is then incomplete and must not be committed
  const latest = new Map();
  if (!offline) {
    for (let i = 0; i < pages.length; i += 50) {
      const body = await api({ action: 'query', prop: 'info', pageids: pages.slice(i, i + 50).map(p => p.pageid).join('|') });
      for (const p of body.query.pages) latest.set(p.pageid, p.lastrevid);
    }
    mkdirSync(CACHE, { recursive: true });
    writeFileSync(join(CACHE, 'pages.json'), JSON.stringify(pages));
  }
  const sampleRecords = [];
  for (const [i, page] of pages.entries()) {
    const h = await pageHistory(page, latest.get(page.pageid), offline);
    if (h) sampleRecords.push(...sampleEvidence(h));
    if (i % 100 === 99) log(`${i + 1}/${pages.length} loot pages, ${requests} requests`);
  }
  const priceInfo = offline ? null : (await api({ action: 'query', prop: 'info', titles: PRICES_TITLE })).query.pages[0];
  const priceHistory = await pageHistory({ pageid: priceInfo?.pageid ?? readJson(join(CACHE, 'prices-pageid.json'), null), title: PRICES_TITLE }, priceInfo?.lastrevid, offline);
  if (priceInfo) writeFileSync(join(CACHE, 'prices-pageid.json'), JSON.stringify(priceInfo.pageid));
  const samples = appendEvidence(join(OUT, 'loot'), sampleRecords);
  const prices = appendEvidence(join(OUT, 'item-prices'), priceEvidence(priceHistory));
  let versions = readJson(join(OUT, 'versions.json'), null);
  if (!offline) {
    const updates = await allPages({ apnamespace: '0', apprefix: 'Updates/' });
    const facts = [];
    for (let i = 0; i < updates.length; i += 50) {
      const body = await api({ action: 'query', prop: 'revisions', pageids: updates.slice(i, i + 50).map(p => p.pageid).join('|'), rvprop: 'content', rvslots: 'main' });
      for (const p of body.query.pages) {
        const f = versionFacts(p.revisions?.[0]?.slots.main.content ?? '');
        const version = p.title.slice('Updates/'.length);
        const date = f.date ? new Date(`${f.date} UTC`) : null;
        facts.push({ version, date: date && !Number.isNaN(date.getTime()) ? date.toISOString().slice(0, 10) : null, name: f.name, type: f.primarytype, implemented: f.implemented });
      }
    }
    versions = { format: 1, note: 'Client versions and their release dates from the TibiaWiki Updates/<version> pages (CC-BY-SA). A version is effective, and public, from its release date; a sample "made after" a version is valid from that date. Undated builds are bounded by the latest dated version below them when used.',
      versions: facts.sort((a, b) => a.version.localeCompare(b.version, 'en', { numeric: true })) };
    writeFileSync(join(OUT, 'versions.json'), JSON.stringify(versions, null, 1) + '\n');
  }
  return { pages: pages.length, requests, samples, prices, versions: versions?.versions.length ?? 0 };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const i = process.argv.indexOf('--limit');
  console.log(JSON.stringify(await fetchLoot({ offline: process.argv.includes('--offline'), limit: i > 0 ? Number(process.argv[i + 1]) : null })));
}
