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
let dbPromise = null;

function db() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains(STORE)) {
        const os = d.createObjectStore(STORE, { keyPath: 'hash' });
        os.createIndex('world', 'world');
        os.createIndex('capturedAt', 'capturedAt');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx(mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode);
    const os = t.objectStore(STORE);
    let out;
    try { out = fn(os); } catch (e) { reject(e); return; }
    // NB: a miss leaves request.result === undefined, so '?? out' would wrongly
    // hand back the IDBRequest itself and make every lookup look like a hit.
    t.oncomplete = () => resolve(out instanceof IDBRequest ? out.result : out);
    t.onerror = () => reject(t.error);
  });
}

export const all = () => tx('readonly', os => os.getAll());
export const get = hash => tx('readonly', os => os.get(hash));
export const remove = hash => tx('readwrite', os => os.delete(hash));
export const clear = () => tx('readwrite', os => os.clear());

export async function put(input) {
  const rec = toRecord(input);
  await tx('readwrite', os => os.put(rec));
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
