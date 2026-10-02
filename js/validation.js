import { statisticsIssues, validTimeZone, normalizeCapturedAt } from './statistics.js';
import { fmt, spread, goldOf } from './format.js';
import { normalizeEndsAt } from './offers.js';

export function analyse(state) {
  const { sell, buy } = state.rows ?? {sell:[],buy:[]};
  const statisticsWarnings = state.viewType !== 'statistics' ? [] : statisticsIssues(state.statistics30d).map(i => i.reason);
  const warn = [...(state.ocrWarnings ?? []), ...statisticsWarnings];
  const capturedAt = normalizeCapturedAt(state.capturedAt);
  if (state.captureTimeZone != null && !validTimeZone(state.captureTimeZone)) warn.push('Capture timezone must be a valid IANA timezone');
  if (!capturedAt) warn.push('Capture timestamp is invalid');
  // Without a world there is nothing to file the observation under. Flagging it
  // here is what keeps it out of the "ready" count and out of Save all.
  if (!state.world) {
    warn.push(state.worldNote ?? 'the world could not be resolved from the filename');
  }
  if (state.viewType === 'statistics') return {warn, ok:warn.length === 0, offerOk:true};
  const live = s => s.filter(r => r.amount > 0 && r.price > 0);
  const S = live(sell), B = live(buy);

  for (const [side, rows] of [['Sell', sell], ['Buy', buy]]) {
    if (rows.length > 10) warn.push(`${side}: more than ten visible offers`);
    rows.forEach((r, i) => {
      if (![r.amount, r.price, r.total].every(v => Number.isSafeInteger(v) && v > 0)) {
        warn.push(`${side} row ${i + 1}: amount, price and total must be positive integers`);
      }
      if (r.amount > 0 && r.price > 0 && !normalizeEndsAt(r.endsAt)) {
        warn.push(`${side} row ${i + 1}: correct Ends At (YYYY-MM-DD, HH:MM:SS) to track this offer`);
      }
      if (r.total > 0 && r.amount * r.price !== r.total) {
        r.bad = true;
        warn.push(`${side} row ${i + 1}: ${fmt(r.amount)} × ${fmt(r.price)} = ` +
                  `${fmt(r.amount * r.price)}, but the screenshot total reads ${fmt(r.total)}`);
      } else r.bad = false;
    });
  }
  if (!S.length || !B.length) {
    return { warn: [...warn, 'Both a Sell and a Buy offer are required'], ok: false };
  }
  const bestSell = Math.min(...S.map(r => r.price));
  const bestBuy = Math.max(...B.map(r => r.price));
  if (S[0].price !== bestSell) {
    warn.push(`the first Sell row (${fmt(S[0].price)}) is not the best Sell price ` +
              `(${fmt(bestSell)}); the market is normally sorted, so check the read`);
  }
  if (B[0].price !== bestBuy) {
    warn.push(`the first Buy row (${fmt(B[0].price)}) is not the best Buy price ` +
              `(${fmt(bestBuy)}); the market is normally sorted, so check the read`);
  }
  if (S.some((r, i) => i && r.price < S[i - 1].price)) warn.push('Sell offers are not sorted by price');
  if (B.some((r, i) => i && r.price > B[i - 1].price)) warn.push('Buy offers are not sorted by price');
  if (bestBuy >= bestSell) {
    warn.push(`crossed market: best Buy ${fmt(bestBuy)} ≥ best Sell ${fmt(bestSell)}; ` +
              'those offers would already have matched, so a price is misread');
  }
  return {
    sell: bestSell, buy: bestBuy,
    sellVolume: S.reduce((a, r) => a + r.amount, 0),
    buyVolume: B.reduce((a, r) => a + r.amount, 0),
    goldDemand: goldOf(S),
    goldSupply: goldOf(B),
    // quantity available at the best price - the binding constraint on any
    // cross-world trade, since only these coins change hands at that price
    sellTopAmount: S.filter(r => r.price === bestSell).reduce((a, r) => a + r.amount, 0),
    buyTopAmount: B.filter(r => r.price === bestBuy).reduce((a, r) => a + r.amount, 0),
    sellRows: S.length, buyRows: B.length,
    spread: spread({ sell: bestSell, buy: bestBuy }),
    warn, offerOk: warn.length === statisticsWarnings.length, ok: warn.length === 0
  };
}
