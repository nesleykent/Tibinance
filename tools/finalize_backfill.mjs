import { toRecord, ALLOWED } from '../js/store.js';
import { INGESTION_VERSION } from '../js/ingestion.js';
import { STATISTICS_CSV_HEADERS, statisticsCSVValues } from '../js/statistics.js';
// Allocate canonical UUIDs with the same matcher as interactive ingestion.
import { readFile, writeFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { matchOffers, offerObservations, offerKey } from '../js/offers.js';

const directory = process.argv[2];
if (!directory) throw new Error('Usage: node tools/finalize_backfill.mjs <output-directory>');
const path = name => resolve(directory, name);
const allowed = ALLOWED;
const extracted = JSON.parse(await readFile(path('captures-extracted.json'), 'utf8'))
  .map(c => c.processingVersion >= INGESTION_VERSION || c.statistics30d != null ? toRecord(c) : Object.fromEntries(allowed.filter(k => k in c).map(k => [k,c[k]])))
  .sort((a,b) => Date.parse(a.capturedAtUtc ?? `${a.capturedAt}Z`)-Date.parse(b.capturedAtUtc ?? `${b.capturedAt}Z`) || a.hash.localeCompare(b.hash));
if (new Set(extracted.map(c => c.hash)).size !== extracted.length) throw new Error('Duplicate capture hashes');
if (extracted.some(c => !Number.isFinite(Date.parse(`${c.capturedAt}Z`)))) throw new Error('Invalid capture timestamp');
let verifiedItems = null;
try {
  const results = JSON.parse(await readFile(path('backfill-results.json'), 'utf8'));
  const strict = results.some(r => r.processingVersion >= 2);
  verifiedItems = new Set(results.filter(r => r.itemVerification?.status === 'tibia_coins' && (!strict || r.status === 'ready')).map(r => r.hash));
} catch (error) { if (error.code !== 'ENOENT') throw error; }
let previous = [];
try { previous = JSON.parse(await readFile(path('observations-enriched.json'), 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const currentHashes = new Set(extracted.map(c => c.hash));
const catalog = previous.filter(c => currentHashes.has(c.hash) && (!verifiedItems || verifiedItems.has(c.hash)));
function stableUUID(key, occurrence, firstCapture) {
  // This immutable identity namespace is independent of OCR processing versions.
  const hex = createHash('sha256').update(JSON.stringify(['tibinance-archive-v2',key,occurrence,firstCapture])).digest('hex');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-8${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;
}
const records = extracted.map(c => {
  const old = previous.find(p => p.hash === c.hash);
  if (verifiedItems && !verifiedItems.has(c.hash)) {
    if (c.processingVersion >= INGESTION_VERSION) throw new Error('Canonical capture lacks validated item proof');
    const { offers, processingVersion, ...snapshot } = c;
    return snapshot;
  }
  if (c.viewType === 'statistics') return c;
  if (!c.offers) return old?.offers ? { ...c, offers: old.offers, processingVersion: old.processingVersion } : c;
  const occurrences = new Map();
  const prepared = c.offers.map(r => {
    const key = offerKey(c.world,r), occurrence = occurrences.get(key) ?? 0;
    occurrences.set(key,occurrence+1);
    return {...r,offerId:stableUUID(key,occurrence,c.hash)};
  });
  const result = { ...c, offers: matchOffers(c.world, prepared, catalog, old?.offers ?? []) };
  catalog.push(result);
  return result;
});
const offers = offerObservations(records);
// Propagate collision uncertainty to earlier observations too.
const ambiguous = new Set(offers.filter(r => r.matchAmbiguous).map(r => r.offerId));
for (const c of records) for (const r of c.offers ?? []) if (ambiguous.has(r.offerId)) r.matchAmbiguous = true;
await writeFile(path('observations-enriched.json.tmp'), JSON.stringify(records, null, 2) + '\n');
await rename(path('observations-enriched.json.tmp'), path('observations-enriched.json'));
const keys = ['world','side','offerId','capturedAt','capturedAtUtc','captureTimeZone','hash','rowIndex','amount','price','total','endsAt','endsAtUtc','matchAmbiguous','processingVersion'];
await writeFile(path('offer-observations.csv'), [keys.join(','), ...offers.map(r => keys.map(k => `"${String(r[k] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n') + '\n');
const captureKeys = ['world','type','battleye','sell','sellVolume','buy','buyVolume','goldDemand','goldSupply','sellTopAmount','buyTopAmount','capturedAt','hash','viewType','capturedAtUtc','captureDate','captureTimeZone','statisticsReferenceDate'];
await writeFile(path('observations.csv'), [captureKeys.concat(STATISTICS_CSV_HEADERS).join(','), ...records.map(c => captureKeys.map(k => c[k] ?? '').concat(statisticsCSVValues(c)).map(v => `"${String(v).replaceAll('"','""')}"`).join(','))].join('\n') + '\n');
console.log(JSON.stringify({ captures: records.length, enriched: records.filter(r => r.offers).length,
  observations: offers.length, offers: new Set(offers.map(r => r.offerId).filter(Boolean)).size }));
