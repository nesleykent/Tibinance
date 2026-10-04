// Freeze public pool inputs; build_tibia_token.mjs turns them into completed UTC history.
import { readFile, writeFile } from 'node:fs/promises';
import { CONTRACT, POOL } from '../js/tibia-token.js';
const root = new URL('../data/market-history/tibia-token/inputs/', import.meta.url);
const api = 'https://api.geckoterminal.com/api/v2/networks/bsc';
async function get(url) {
  const response = await fetch(url);
  if (!response.ok) { const error = new Error(`Provider returned ${response.status}`); error.status = response.status; throw error; }
  return response.json();
}
const asOf = new Date().toISOString().slice(0, 10);
const pools = await get(`${api}/tokens/${CONTRACT.toLowerCase()}/pools`);
if (!pools.data.some(p => p.attributes.address === POOL && p.relationships.base_token.data.id === `bsc_${CONTRACT.toLowerCase()}`)) throw new Error('Verified TIB pool missing.');
const pages = []; let before = '', restricted = false;
for (let n = 0; n < 12; n++) {
  let page;
  try { page = await get(`${api}/pools/${POOL}/ohlcv/day?aggregate=1&limit=1000&currency=usd&token=base&include_empty_intervals=false${before ? `&before_timestamp=${before}` : ''}`); }
  catch (e) { if (e.status === 401 && pages.length) { restricted = true; break; } throw e; }
  const rows = page.data?.attributes?.ohlcv_list;
  if (!Array.isArray(rows)) throw new Error('Missing daily candles.');
  if (!rows.length) break;
  if (page.meta?.base?.address?.toLowerCase() !== CONTRACT.toLowerCase()) throw new Error('Candle token mismatch.');
  pages.push(page);
  const oldest = Math.min(...rows.map(row => row[0]));
  if (before && oldest >= Number(before)) throw new Error('Pagination did not advance.');
  before = String(oldest - 1);
  if (new Date(oldest * 1000).toISOString().slice(0, 10) <= '2025-01-14') break;
  if (n === 11) throw new Error('Pagination limit reached before full history.');
  await new Promise(resolve => setTimeout(resolve, 2200));
}
if (!pages.length) throw new Error('No history returned; frozen inputs preserved.');
// Preserve older acquired days as the public access window moves forward.
const previous = JSON.parse(await readFile(new URL('manifest.json', root)));
const freshDays = new Set(pages.flatMap(p => p.data.attributes.ohlcv_list.map(row => row[0])));
const retained = [];
for (const name of previous.pages) {
  const page = JSON.parse(await readFile(new URL(name, root)));
  retained.push(...page.data.attributes.ohlcv_list.filter(row => !freshDays.has(row[0])));
}
if (retained.length) pages.push({ ...pages[0], data: { ...pages[0].data, attributes: { ohlcv_list: retained } } });
const first = new Date(Math.min(...pages.flatMap(p => p.data.attributes.ohlcv_list.map(r => r[0]))) * 1000).toISOString().slice(0, 10);
const names = pages.map((_, i) => `daily-${i + 1}.json`);
for (let i = 0; i < pages.length; i++) await writeFile(new URL(names[i], root), JSON.stringify(pages[i]) + '\n');
await writeFile(new URL('pools.json', root), JSON.stringify(pools) + '\n');
await writeFile(new URL('manifest.json', root), JSON.stringify({ asOf, pages: names,
  coverageNote: restricted ? `Public API history begins on ${first}. Earlier candles require provider access unavailable to this dataset. No pre-coverage prices are estimated.` : `Acquired pool history begins on ${first}. No pre-coverage prices are estimated.` }, null, 2) + '\n');
console.log('Frozen TIB inputs refreshed. Run node tools/build_tibia_token.mjs and the TIB tests.');
