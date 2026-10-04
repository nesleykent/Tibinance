// Reproducible completed UTC candles from frozen, contract-verified public pool inputs.
import { readFile, writeFile } from 'node:fs/promises';
import { tokenView, CONTRACT, POOL } from '../js/tibia-token.js';
const root = new URL('../data/market-history/tibia-token/', import.meta.url);
export function buildToken(manifest, pools, pages) {
  const pool = pools.data.find(p => p.attributes.address === POOL);
  const base = `bsc_${CONTRACT.toLowerCase()}`;
  if (pool?.relationships.base_token.data.id !== base || pool.relationships.quote_token.data.id !== 'bsc_0x55d398326f99059ff775485246999027b3197955') throw new Error('Pool does not match TIB / USDT.');
  const byDay = new Map();
  for (const page of pages) {
    if (page.meta?.base?.address?.toLowerCase() !== CONTRACT.toLowerCase() || page.meta?.quote?.symbol !== 'USDT') throw new Error('Candle token identity mismatch.');
    for (const row of page.data.attributes.ohlcv_list) {
      if (row.length !== 6 || !Number.isInteger(row[0]) || row[0] % 86400) throw new Error('Invalid UTC candle timestamp.');
      const day = new Date(row[0] * 1000).toISOString().slice(0, 10);
      if (day >= manifest.asOf) continue; // exclude the incomplete acquisition day
      const candle = { day, open: row[1], high: row[2], low: row[3], close: row[4], volumeUsd: row[5] };
      if (byDay.has(day) && JSON.stringify(byDay.get(day)) !== JSON.stringify(candle)) throw new Error(`Conflicting candles on ${day}.`);
      byDay.set(day, candle);
    }
  }
  const file = { schemaVersion: 1, asset: 'tibia-token', symbol: 'TIB', contract: CONTRACT, network: 'BNB Smart Chain', pool: POOL,
    venue: 'PancakeSwap V3', pair: 'TIB / USDT', quote: 'USD', timezone: 'UTC', asOf: manifest.asOf,
    source: 'GeckoTerminal public pool OHLCV API', sourceUrl: `https://www.geckoterminal.com/bsc/pools/${POOL}`,
    coverageNote: manifest.coverageNote, prices: [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day)) };
  tokenView(file, null);
  return file;
}
const manifest = JSON.parse(await readFile(new URL('inputs/manifest.json', root)));
const pools = JSON.parse(await readFile(new URL('inputs/pools.json', root)));
const pages = await Promise.all(manifest.pages.map(async name => JSON.parse(await readFile(new URL(`inputs/${name}`, root)))));
const output = JSON.stringify(buildToken(manifest, pools, pages), null, 2) + '\n';
const destination = new URL('history.json', root);
if (process.argv.includes('--check')) {
  if (await readFile(destination, 'utf8') !== output) throw new Error('TIB history is not a fresh build.');
} else await writeFile(destination, output);
console.log(`TIB history verified: ${JSON.parse(output).prices.length} completed UTC days.`);
