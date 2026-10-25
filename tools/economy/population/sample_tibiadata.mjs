// Prospective online counts from TibiaData (Stage D, labelled prospective). Automatic collection is disabled.
//
//   node tools/economy/population/sample_tibiadata.mjs <directory>
//
// One request (api.tibiadata.com/v5/worlds) gives every world's players online at that moment, as tibia.com shows it.
// Each run appends one line to <directory>/<YYYY-MM>.jsonl: the TibiaData timestamp and the count per world.
// The manual online-sampler workflow keeps these on data/online-samples. It is disabled pending explicit re-enabling.
// This series starts when sampling started: it is never merged into, or presented as, the historical GuildStats
// series it cannot replace. Gaps (a skipped or late sample) stay gaps; player-hours integrate only across
// contiguous samples.
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] ?? 'samples';
const r = await fetch('https://api.tibiadata.com/v5/worlds', { headers: { 'User-Agent': 'TibinanceResearch/1.0 (https://github.com/nesleykent/Tibinance)' } });
if (!r.ok) throw new Error(`TibiaData: HTTP ${r.status}`);
const body = await r.json();
const at = body.information?.timestamp;
const worlds = Object.fromEntries((body.worlds?.regular_worlds ?? []).map(w => [w.name, w.players_online]).sort());
if (!at || !Object.keys(worlds).length) throw new Error('TibiaData: no worlds in the response');
mkdirSync(dir, { recursive: true });
appendFileSync(join(dir, `${at.slice(0, 7)}.jsonl`), JSON.stringify({ at, collectedAt: new Date().toISOString(), worlds }) + '\n');
console.log(`${at}: ${Object.keys(worlds).length} worlds, ${Object.values(worlds).reduce((a, b) => a + b, 0)} players online`);
