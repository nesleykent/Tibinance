// Daily ECB observations, persisted for static hosting. An unsuccessful refresh never replaces the last snapshot.
import { readFile, writeFile, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { FX_API, normalizeRates, validateFx } from '../js/foreign-exchange.js';
import { validatePrices } from '../js/coin-costs.js';
const DEFAULT_DESTINATION = new URL('../data/foreign-exchange/history.json', import.meta.url);
export function mergeRates(previous, incoming) {
  const days = new Map((previous ?? []).map(r => [r.day, r]));
  for (const r of incoming) days.set(r.day, r);
  return [...days.values()].sort((a,b) => a.day.localeCompare(b.day));
}
export async function refreshFx({ fetcher = fetch, now = new Date(), destination = DEFAULT_DESTINATION } = {}) {
  let previous = null;
  try { previous = validateFx(JSON.parse(await readFile(destination, 'utf8'))); }
  catch (e) { if (e.code !== 'ENOENT') throw e; }
  // Recheck the last week for source revisions. Retain all earlier acquired history.
  const token = JSON.parse(await readFile(new URL('../data/market-history/tibia-token/history.json', import.meta.url)));
  const anchor = previous?.rates.at(-1).day ?? token.prices[0].day;
  const from = new Date(Date.parse(anchor) - 7 * 86400000).toISOString().slice(0, 10);
  const url = `${FX_API}&from=${from}&to=${now.toISOString().slice(0,10)}`;
  let rows;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetcher(url, { signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error(`ECB API: HTTP ${response.status}`);
      rows = normalizeRates(await response.json()); break;
    } catch (error) { if (attempt === 2) throw error; await new Promise(r => setTimeout(r, 1000 * 2 ** attempt)); }
  }
  if (previous && rows.at(-1).day < previous.rates.at(-1).day) throw new Error('ECB response regressed; persisted history retained.');
  const file = validateFx({ schemaVersion:1, provider:'ecb', source:'European Central Bank via Frankfurter v2',
    sourceUrl:'https://frankfurter.dev/', requestUrl:url, fetchedAt:now.toISOString(),
    timing:'ECB daily reference observations, normally published around 16:00 CET on working days. Exact publication time is not supplied by the API.',
    rates:mergeRates(previous?.rates,rows) });
  await writeFile(new URL(`${destination.href}.pending`), JSON.stringify(file, null, 2) + '\n');
  await rename(new URL(`${destination.href}.pending`), destination);
  return file;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  validatePrices(JSON.parse(await readFile(new URL('../data/coin-prices.json', import.meta.url))));
  const file = process.argv.includes('--check') ? validateFx(JSON.parse(await readFile(DEFAULT_DESTINATION))) : await refreshFx();
  console.log(`ECB history verified: ${file.rates.length} publications, through ${file.rates.at(-1).day}.`);
}
