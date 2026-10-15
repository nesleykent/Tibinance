import { validDay, rateOn } from './foreign-exchange.js';
export const FIAT = ['EUR', 'BRL', 'USD'];
export const CURRENCIES = [...FIAT, 'TIB'];
export function validatePrices(file) {
  if (file?.schemaVersion !== 1 || !Array.isArray(file.observations) || !file.observations.length) throw new Error('Missing manual price observations.');
  let previous = '';
  for (const o of file.observations) {
    if (!validDay(o.effectiveFrom) || o.effectiveFrom <= previous || !Array.isArray(o.packages) || !o.packages.length) throw new Error('Invalid manual price dates.');
    previous = o.effectiveFrom;
    const seen = new Set();
    for (const p of o.packages) {
      if (!Number.isSafeInteger(p.coins) || p.coins <= 0 || seen.has(p.coins) || !Number.isFinite(p.EUR) || p.EUR <= 0
        || FIAT.some(c => p[c] !== null && (!Number.isFinite(p[c]) || p[c] <= 0))) throw new Error('Invalid manual package price.');
      seen.add(p.coins);
    }
  }
  return file;
}
export function observationOn(observations, day) { return observations.filter(o => o.effectiveFrom <= day).at(-1) ?? null; }
export function convert(amount, from, to, fx, tibUsd) {
  if (amount === null || !Number.isFinite(amount) || !CURRENCIES.includes(from) || !CURRENCIES.includes(to)) return null;
  if (from === to) return amount;
  if (!fx || (from === 'TIB' || to === 'TIB') && !(Number.isFinite(tibUsd) && tibUsd > 0)) return null;
  const units = { ...fx, TIB: fx.USD / tibUsd };
  return amount / units[from] * units[to]; // no rounding until formatting
}
export function comparePackage(pkg, currency, fx, tibUsd) {
  const amounts = FIAT.map(c => ({ currency: c, original: pkg[c], eur: convert(pkg[c], c, 'EUR', fx, tibUsd) }));
  const available = amounts.filter(r => r.eur !== null);
  const best = available.length ? Math.min(...available.map(r => r.eur)) : null;
  const cheapest = available.find(r => Math.abs(r.eur - best) < 1e-12)?.currency ?? null;
  const rows = amounts.map(r => {
    const converted = convert(r.original, r.currency, currency, fx, tibUsd);
    const savingEur = r.eur === null || best === null ? null : Math.max(0, r.eur - best);
    return { ...r, converted, tib: convert(r.original, r.currency, 'TIB', fx, tibUsd),
      perCoin: converted === null ? null : converted / pkg.coins,
      premium: r.eur === null || best === null ? null : r.eur / best - 1,
      saving: convert(savingEur, 'EUR', currency, fx, tibUsd), savingRatio: r.eur === null || best === null ? null : savingEur / r.eur,
      referencePremium: r.eur === null ? null : r.eur / pkg.EUR - 1 };
  });
  return { coins: pkg.coins, rows, cheapest, cheapestCurrencies: available.filter(r => Math.abs(r.eur - best) < 1e-12).map(r => r.currency) };
}
export function historicalCosts(rates, tokens, observations, { coins, currency, mode, metric }) {
  const tokenByDay = new Map(tokens.map(p => [p.day, p]));
  const needsToken = metric === 'power' || metric === 'cost' && currency === 'TIB';
  const days = needsToken ? tokens.map(p => p.day) : rates.map(p => p.day);
  return days.flatMap(day => {
    const fx = rateOn(rates, day), token = tokenByDay.get(day);
    const o = mode === 'scenario' ? observations.at(-1) : observationOn(observations, day);
    const pkg = o?.packages.find(p => p.coins === coins);
    if (!fx || !pkg) return [];
    const comparison = comparePackage(pkg, currency, fx, token?.close);
    const values = Object.fromEntries(comparison.rows.map(r => [r.currency,
      metric === 'power' ? r.tib === null ? null : coins / r.tib : metric === 'premium' ? r.referencePremium === null ? null : r.referencePremium * 100 : r.converted]));
    return [{ day, fxDay: fx.day, effectiveFrom: o.effectiveFrom, values }];
  });
}
export function money(value, currency, perCoin = false) {
  if (value === null || !Number.isFinite(value)) return 'N/A';
  const digits = perCoin ? 5 : currency === 'TIB' ? 4 : 2;
  const options = { minimumFractionDigits: digits, maximumFractionDigits: digits };
  return currency === 'TIB' ? `${new Intl.NumberFormat('en-US', options).format(value)} TIB`
    : new Intl.NumberFormat('en-US', { style: 'currency', currency, currencyDisplay: 'code', ...options }).format(value);
}
