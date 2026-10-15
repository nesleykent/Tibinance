// One ECB publication supplies both legs; USD/BRL is always their cross rate.
export const FX_API = 'https://api.frankfurter.dev/v2/providers/ecb/rates?base=EUR&quotes=BRL,USD';
export const FX_PATH = 'data/foreign-exchange/history.json';
const DAY = 86400000;
export const validDay = day => typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day)
  && Number.isFinite(Date.parse(day)) && new Date(day).toISOString().slice(0, 10) === day;
export const ageDays = (day, now = new Date()) => (Date.parse(now.toISOString().slice(0, 10)) - Date.parse(day)) / DAY;
// Four calendar days allow weekends and ECB closing days. Longer delays are explicit stale data.
export const stale = (day, now = new Date()) => !validDay(day) || ageDays(day, now) > 4;
export function normalizeRates(rows) {
  if (!Array.isArray(rows) || !rows.length) throw new Error('No ECB rates returned.');
  const days = new Map();
  for (const row of rows) {
    if (!validDay(row.date) || row.base !== 'EUR' || !['USD', 'BRL'].includes(row.quote)
      || !Number.isFinite(row.rate) || row.rate <= 0) throw new Error('Invalid ECB observation.');
    const rates = days.get(row.date) ?? { day: row.date, EUR: 1 };
    if (rates[row.quote] !== undefined) throw new Error('Duplicate ECB observation.');
    rates[row.quote] = row.rate; days.set(row.date, rates);
  }
  const result = [...days.values()].sort((a, b) => a.day.localeCompare(b.day));
  if (result.some(r => !r.USD || !r.BRL)) throw new Error('Incomplete same-day ECB rates.');
  return result;
}
export function validateFx(file) {
  if (file?.schemaVersion !== 1 || file.provider !== 'ecb' || !Number.isFinite(Date.parse(file.fetchedAt))
    || !Array.isArray(file.rates) || !file.rates.length) throw new Error('Invalid FX history.');
  let previous = '';
  for (const r of file.rates) {
    if (!validDay(r.day) || r.day <= previous || r.day > file.fetchedAt.slice(0, 10) || r.EUR !== 1
      || ![r.BRL, r.USD].every(v => Number.isFinite(v) && v > 0)) throw new Error('Invalid FX rate or order.');
    previous = r.day;
  }
  return file;
}
export function rateOn(rates, day) {
  // Publication dates remain attached to weekend/holiday valuations; nothing is relabelled as observed.
  let lo = 0, hi = rates.length - 1, found = null;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (rates[mid].day <= day) { found = rates[mid]; lo = mid + 1; } else hi = mid - 1; }
  return found && (Date.parse(day) - Date.parse(found.day)) / DAY <= 4 ? found : null;
}
export async function loadFx({ fetcher = fetch, storage } = {}) {
  if (storage === undefined) try { storage = globalThis.localStorage; } catch { /* browser storage denied */ }
  const key = 'tibinance.fx.ecb.v1';
  let cached = null;
  try { cached = validateFx(JSON.parse(storage?.getItem(key) ?? 'null')); } catch { /* no valid local snapshot */ }
  try {
    const response = await fetcher(FX_PATH, { cache: 'no-cache', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`FX history: ${response.status}`);
    const fresh = validateFx(await response.json());
    const file = cached && cached.fetchedAt > fresh.fetchedAt ? cached : fresh;
    try { storage?.setItem(key, JSON.stringify(file)); } catch { /* storage unavailable or full */ }
    return { file, cached: false };
  } catch (error) { if (cached) return { file: cached, cached: true }; throw error; }
}
