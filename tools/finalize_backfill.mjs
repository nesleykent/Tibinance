// Allocate canonical UUIDs with the same matcher as interactive ingestion.
import { readFile, writeFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { matchOffers, offerObservations } from '../js/offers.js';

const directory = process.argv[2];
if (!directory) throw new Error('Usage: node tools/finalize_backfill.mjs <output-directory>');
const path = name => resolve(directory, name);
const extracted = JSON.parse(await readFile(path('captures-extracted.json'), 'utf8'));
let verifiedItems = null;
try {
  const results = JSON.parse(await readFile(path('backfill-results.json'), 'utf8'));
  verifiedItems = new Set(results.filter(r => r.itemVerification?.status === 'tibia_coins').map(r => r.hash));
} catch (error) { if (error.code !== 'ENOENT') throw error; }
let previous = [];
try { previous = JSON.parse(await readFile(path('observations-enriched.json'), 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const catalog = previous.filter(c => !verifiedItems || verifiedItems.has(c.hash));
const records = extracted.map(c => {
  const old = previous.find(p => p.hash === c.hash);
  if (verifiedItems && !verifiedItems.has(c.hash)) {
    const { offers, processingVersion, ...snapshot } = c;
    return snapshot;
  }
  if (!c.offers) return old?.offers ? { ...c, offers: old.offers, processingVersion: old.processingVersion } : c;
  const result = { ...c, offers: matchOffers(c.world, c.offers, catalog, old?.offers ?? []) };
  catalog.push(result);
  return result;
});
await writeFile(path('observations-enriched.json.tmp'), JSON.stringify(records, null, 2) + '\n');
await rename(path('observations-enriched.json.tmp'), path('observations-enriched.json'));
const offers = offerObservations(records);
const keys = ['world','side','offerId','capturedAt','hash','rowIndex','amount','price','total','endsAt','matchAmbiguous','processingVersion'];
await writeFile(path('offer-observations.csv'), [keys.join(','), ...offers.map(r => keys.map(k => `"${String(r[k] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n') + '\n');
console.log(JSON.stringify({ captures: records.length, enriched: records.filter(r => r.offers).length,
  observations: offers.length, offers: new Set(offers.map(r => r.offerId).filter(Boolean)).size }));
