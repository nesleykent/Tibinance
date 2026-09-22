/*
 * Persistence + the privacy boundary.
 *
 * ALLOWED is the whole contract: exactly these nine fields are ever written.
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
export const ALLOWED = [...REQUIRED, ...OPTIONAL];

export function toRecord(input) {
  const rec = {};
  for (const k of REQUIRED) {
    if (input[k] === undefined || input[k] === null || input[k] === '') {
      throw new Error(`Refusing to store an incomplete record: "${k}" is missing`);
    }
    rec[k] = input[k];
  }
  for (const k of OPTIONAL) {
    rec[k] = Number.isFinite(input[k]) ? input[k] : null;
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

export async function put(input) {
  const rec = toRecord(input);
  await tx(STORE, 'readwrite', os => os.put(rec));
  return rec;
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
      if (await hasHash(row.hash)) continue;
      await put(row);
      added++;
    } catch { /* skip malformed baseline rows */ }
  }
  return added;
}

export async function importRows(rows) {
  let added = 0, skipped = 0;
  for (const row of rows) {
    try {
      if (await hasHash(row.hash)) { skipped++; continue; }
      await put(row); added++;
    } catch { skipped++; }
  }
  return { added, skipped };
}

/*
 * The screenshot database is the sole source of truth for which worlds
 * belong to the user's Tibinance dataset. A world becomes eligible for
 * TibiaMarket history only by appearing here first - never the reverse.
 */
export async function screenshotWorlds() {
  const rows = await all();
  return [...new Set(rows.map(r => r.world))].sort();
}

export const allLegacy = () => tx(LEGACY_STORE, 'readonly', os => os.getAll());

export async function legacyForWorld(world) {
  const rows = await tx(LEGACY_STORE, 'readonly', os => os.index('world').getAll(world));
  return rows.sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
}

export async function putLegacyBatch(world, rows) {
  const d = await db();
  await new Promise((resolve, reject) => {
    const t = d.transaction(LEGACY_STORE, 'readwrite');
    const os = t.objectStore(LEGACY_STORE);
    for (const r of rows) {
      os.put({ id: `${world}::${r.capturedAt}`, world, ...r });
    }
    t.oncomplete = resolve;
    t.onerror = () => reject(t.error);
  });
}

export const legacyMetaFor = world => tx(LEGACY_META, 'readonly', os => os.get(world));

export const markLegacyFetched = (world, ok) =>
  tx(LEGACY_META, 'readwrite', os => os.put({ world, fetchedAt: new Date().toISOString(), ok }));

/** Worlds already scoped in (screenshot-derived) that have no legacy fetch attempt yet. */
export async function worldsNeedingLegacyFetch() {
  const [worlds, metaRows] = await Promise.all([
    screenshotWorlds(),
    tx(LEGACY_META, 'readonly', os => os.getAll())
  ]);
  const done = new Set(metaRows.filter(m => m.ok).map(m => m.world));
  return worlds.filter(w => !done.has(w));
}
