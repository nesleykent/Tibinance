import { validatedStatistics, statisticsReferenceDate, validTimeZone, captureInstant, normalizeCapturedAt } from './statistics.js';
import { matchOffers, normalizeEndsAt, PROCESSING_VERSION } from './offers.js';
import { analyse } from './validation.js';
import { INGESTION_VERSION } from './ingestion.js';
/*
 * Persistence + the privacy boundary.
 *
 * ALLOWED is the snapshot contract; offers have their own strict whitelist.
 * toRecord() builds a fresh object from that list, so a character name, a
 * filename or image data cannot reach storage even if a caller passes one in.
 */
export const REQUIRED = ['world', 'type', 'battleye', 'sell', 'sellVolume',
                         'buy', 'buyVolume', 'capturedAt', 'hash'];

/*
 * These cannot be recomputed from the fields above and so are stored. The gold
 * figures are sums over every visible offer; the top amounts are the quantity
 * available at the best price, which is what actually limits how much of a
 * cross-world price difference can be taken. All optional, so rows exported
 * before they existed still import cleanly.
 */
export const OPTIONAL = ['goldSupply', 'goldDemand', 'sellTopAmount', 'buyTopAmount'];
export const ALLOWED = [...REQUIRED, ...OPTIONAL, 'offers', 'processingVersion', 'statistics30d', 'captureDate', 'captureTimeZone', 'statisticsReferenceDate', 'capturedAtUtc', 'viewType'];

export function toRecord(input) {
  const rec = {};
  const statsOnly = input.viewType === 'statistics';
  if (input.viewType != null && !['offers','statistics'].includes(input.viewType)) throw new Error('Invalid Market view type');
  const required = statsOnly ? ['world','type','battleye','capturedAt','hash'] : REQUIRED;
  for (const k of required) {
    if (input[k] === undefined || input[k] === null || input[k] === '') {
      throw new Error(`Refusing to store an incomplete record: "${k}" is missing`);
    }
    rec[k] = input[k];
  }
  if (input.viewType != null) rec.viewType = input.viewType;
  if (Number.isSafeInteger(input.processingVersion) && input.processingVersion > 0) rec.processingVersion = input.processingVersion;
  for (const k of statsOnly ? [] : OPTIONAL) {
    rec[k] = Number.isFinite(input[k]) ? input[k] : null;
  }
  if (input.statistics30d != null) rec.statistics30d = validatedStatistics(input.statistics30d);
  const canonical = input.processingVersion >= INGESTION_VERSION;
  if (statsOnly && !rec.statistics30d) throw new Error('Canonical capture requires 30-day Statistics');
  if (!normalizeCapturedAt(rec.capturedAt)) throw new Error('Canonical capture timestamp is invalid');
  if (statsOnly || canonical || input.captureDate !== undefined || input.captureTimeZone != null) {
    rec.captureDate = rec.capturedAt.slice(0,10);
    if (input.captureTimeZone != null && !validTimeZone(input.captureTimeZone)) throw new Error('Invalid capture timezone');
    rec.captureTimeZone = input.captureTimeZone ?? null;
    const instant = captureInstant(rec.capturedAt,rec.captureTimeZone);
    rec.capturedAtUtc = instant === null ? null : new Date(instant).toISOString();
    if (statsOnly) rec.statisticsReferenceDate = statisticsReferenceDate(rec.capturedAt, rec.captureTimeZone);
  }
  if (canonical && !statsOnly && !Array.isArray(input.offers)) throw new Error('Canonical Offers capture requires offers');
  if (input.offers !== undefined && !statsOnly) {
    if (!Array.isArray(input.offers)) throw new Error('Invalid offer observations');
    const offers = input.offers.map(r => {
      if (rec.captureTimeZone === undefined) return r; // Preserve legacy clock-only observations.
      const instant = captureInstant(normalizeEndsAt(r.endsAt),rec.captureTimeZone);
      return {...r, endsAtUtc:instant === null ? null : new Date(instant).toISOString()};
    });
    rec.offers = matchOffers(rec.world, offers);
    rec.processingVersion = Number.isSafeInteger(input.processingVersion) && input.processingVersion > 0
      ? input.processingVersion : PROCESSING_VERSION;
    if (rec.processingVersion >= 5) {
      const checked = analyse({ capturedAt: rec.capturedAt, statistics30d: rec.statistics30d,
        viewType:rec.viewType, captureTimeZone:rec.captureTimeZone,
        world: { world: rec.world }, rows: Object.fromEntries(['sell', 'buy'].map(side =>
          [side, rec.offers.filter(row => row.side === side)])) });
      if (!checked.ok) throw new Error('Canonical capture validation failed');
      for (const field of ['sell', 'buy', 'sellVolume', 'buyVolume', 'goldSupply', 'goldDemand', 'sellTopAmount', 'buyTopAmount']) {
        if (rec[field] !== checked[field]) throw new Error('Canonical capture totals do not match its offers');
      }
    }
  }
  // belt and braces: nothing outside ALLOWED can have survived
  const extra = Object.keys(rec).filter(k => !ALLOWED.includes(k));
  if (extra.length) throw new Error(`Refusing to store unexpected fields: ${extra.join(', ')}`);
  return rec;
}

const DB_NAME = 'tcmarket';
const STORE = 'observations';
/*
 * Legacy TibiaMarket history lives in its own store, separate from the
 * privacy-audited one above: it carries no screenshot, no character, no
 * hash - just a world name, a timestamp and two public prices - so none of
 * the ALLOWED/toRecord() boundary applies to it. LEGACY_META remembers which
 * worlds have already been backfilled, keyed by world, so a world is not
 * re-fetched from the API on every load.
 */
const LEGACY_STORE = 'legacy';
const LEGACY_META = 'legacyMeta';
const DB_VERSION = 2;
let dbPromise = null;

function db() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains(STORE)) {
        const os = d.createObjectStore(STORE, { keyPath: 'hash' });
        os.createIndex('world', 'world');
        os.createIndex('capturedAt', 'capturedAt');
      }
      if (!d.objectStoreNames.contains(LEGACY_STORE)) {
        const os = d.createObjectStore(LEGACY_STORE, { keyPath: 'id' });
        os.createIndex('world', 'world');
      }
      if (!d.objectStoreNames.contains(LEGACY_META)) {
        d.createObjectStore(LEGACY_META, { keyPath: 'world' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx(storeName, mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(storeName, mode);
    const os = t.objectStore(storeName);
    let out;
    try { out = fn(os); } catch (e) { reject(e); return; }
    // NB: a miss leaves request.result === undefined, so '?? out' would wrongly
    // hand back the IDBRequest itself and make every lookup look like a hit.
    t.oncomplete = () => resolve(out instanceof IDBRequest ? out.result : out);
    t.onerror = () => reject(t.error);
  });
}

export const all = () => tx(STORE, 'readonly', os => os.getAll());
export const get = hash => tx(STORE, 'readonly', os => os.get(hash));
export const remove = hash => tx(STORE, 'readwrite', os => os.delete(hash));
export const clear = () => tx(STORE, 'readwrite', os => os.clear());

export async function put(input, { reprocess = false, enrich = false } = {}) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(STORE, 'readwrite');
    const os = t.objectStore(STORE);
    let rec, failure;
    const req = os.getAll();
    req.onsuccess = () => {
      try {
        const captures = req.result;
        const existing = captures.find(c => c.hash === input.hash);
        if (existing && !reprocess && !enrich) throw new Error('Screenshot already stored; enable reprocessing to enrich it');
        if (existing && enrich && !canEnrich(existing, input)) { rec = existing; return; }
        // Preserve historical world/time. Canonical reprocessing recomputes
        // validated totals; older enrichment retains its original snapshots.
        const canonical = input.processingVersion >= 5;
        rec = toRecord(existing ? canonical
          ? { ...input, world: existing.world, type: existing.type, battleye: existing.battleye,
              capturedAt: existing.capturedAt, captureTimeZone: existing.captureTimeZone ?? input.captureTimeZone, hash: existing.hash }
          : { ...existing, ...(input.statistics30d ? {statistics30d:input.statistics30d} : {}), offers: input.offers, processingVersion: input.processingVersion }
          : input);
        if (existing && existing.viewType !== rec.viewType && (existing.viewType ?? 'offers') !== (rec.viewType ?? 'offers')) throw new Error('Reprocessing cannot change the Market view');
        if (existing && rec.viewType !== 'statistics' && !input.offers) throw new Error('Reprocessing requires offer data');
        if (rec.offers) {
          for (const side of ['sell', 'buy']) {
            const tracked = (existing?.offers ?? []).filter(r => r.side === side && r.offerId).length;
            if (rec.offers.filter(r => r.side === side && r.offerId).length < tracked) {
              throw new Error('Reprocessing omitted tracked offers; restore the missing rows before saving');
            }
          }
          rec.offers = matchOffers(rec.world, rec.offers, captures, existing?.offers ?? []);
          if (existing?.offers?.some(r => r.offerId) && rec.offers.some(r => !r.offerId)) {
            throw new Error('Correct all Ends At fields before replacing tracked observations');
          }
        }
        os.put(rec);
      } catch (e) { failure = e; t.abort(); }
    };
    t.oncomplete = () => resolve(rec);
    t.onabort = () => reject(failure ?? t.error ?? new Error('Save aborted'));
    t.onerror = () => reject(failure ?? t.error);
  });
}

function canEnrich(existing, incoming) {
  const version = Number.isSafeInteger(incoming.processingVersion) && incoming.processingVersion > 0
    ? incoming.processingVersion : PROCESSING_VERSION;
  return (incoming.viewType === 'statistics' && (!existing.statistics30d || version > (existing.processingVersion ?? 0))) || Array.isArray(incoming.offers) && (!existing.offers ||
    version > (existing.processingVersion ?? 0) ||
    (incoming.statistics30d && !existing.statistics30d) ||
    (incoming.offers.every(r => normalizeEndsAt(r.endsAt)) && existing.offers.some(r => !r.offerId)));
}

export async function hasHash(hash) {
  return Boolean(await get(hash));
}

/** Baseline committed in the repo; merged in without overwriting local rows. */
export async function loadBaseline(url = 'data/observations.json') {
  let rows = [];
  try {
    const r = await fetch(url, { cache: 'no-cache' });
    if (!r.ok) return 0;
    rows = await r.json();
  } catch { return 0; }
  if (!Array.isArray(rows)) return 0;
  let added = 0;
  for (const row of rows) {
    try {
      const existing = await get(row.hash);
      if (existing && !canEnrich(existing, row)) continue;
      await put(row, { enrich: true });
      added++;
    } catch { /* skip malformed baseline rows */ }
  }
  return added;
}

export async function importRows(rows) {
  if (!Array.isArray(rows)) throw new Error('Expected an array of Market captures');
  let added = 0, enriched = 0, skipped = 0;
  for (const row of rows) {
    try {
      const existing = await get(row.hash);
      if (existing && !canEnrich(existing, row)) { skipped++; continue; }
      await put(row, { enrich: true });
      if (existing) enriched++; else added++;
    } catch { skipped++; }
  }
  return { added, enriched, skipped };
}
