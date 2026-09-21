/*
 * Robust statistics for spotting opportunities in the observations.
 *
 * Mean and standard deviation are the wrong tools here. A handful of worlds,
 * one of which is the very outlier being looked for, drags the mean towards
 * itself and inflates the deviation - so the outlier partly hides itself and
 * ordinary worlds look stranger than they are. The median and the median
 * absolute deviation do not move when a few values are extreme, which is
 * exactly the property wanted when the extremes are the point.
 */

export const median = xs => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Median absolute deviation, scaled so it estimates σ for normal data. */
export const mad = (xs, med = median(xs)) =>
  1.4826 * median(xs.map(x => Math.abs(x - med)));

/**
 * Modified z-score (Iglewicz & Hoaglin). |z| > 3.5 is the conventional line
 * for "outlier"; 2 is worth a glance.
 *
 * When every value is identical MAD is 0 and the score is undefined rather
 * than infinite - identical values contain no outlier, whatever the formula
 * would like to say about dividing by zero.
 */
export function zScores(xs) {
  const med = median(xs);
  const d = mad(xs, med);
  if (!Number.isFinite(d) || d === 0) return xs.map(() => 0);
  return xs.map(x => (x - med) / d);
}

export const OUTLIER = 3.5;
export const NOTABLE = 2.0;

/** Quartiles by the same linear interpolation Excel and numpy use. */
export function quantile(xs, q) {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

export function describe(xs) {
  const v = xs.filter(Number.isFinite);
  if (!v.length) return null;
  const med = median(v);
  return {
    n: v.length,
    min: Math.min(...v),
    q1: quantile(v, 0.25),
    median: med,
    q3: quantile(v, 0.75),
    max: Math.max(...v),
    mad: mad(v, med)
  };
}

/*
 * Cross-world arbitrage.
 *
 * Tibia Coins sit on the account, gold sits on the character, and the Market is
 * entered from a depot - so it is per world. Coins bought on one world can
 * therefore be sold on another, and the gold that comes back lands on the
 * second world. A route converts gold held on A into gold held on B at a rate
 * better than the one world alone would give.
 *
 * Buy on A at A's best SELL price (the cheapest ask - what it costs to obtain a
 * coin) and sell on B at B's best BUY price (the highest bid - what someone
 * will pay for it). The route is only worth anything when bid on B exceeds ask
 * on A.
 *
 * Two fee cases, from the game manual:
 *   - accepting offers that already exist costs nothing
 *   - placing your own offer costs 2% of the offer price, at least 20 gold and
 *     at most 1,000,000 gold, charged on each side
 *
 * Size is bounded by the quantity at each best price, and by the 64,000 cap on
 * a single offer.
 */
export const FEE_RATE = 0.02;
export const FEE_MIN = 20;
export const FEE_MAX = 1_000_000;
export const OFFER_MAX = 64_000;

export const fee = total =>
  Math.min(FEE_MAX, Math.max(FEE_MIN, Math.round(total * FEE_RATE)));

export function routes(rows) {
  const out = [];
  for (const from of rows) {
    for (const to of rows) {
      if (from.hash === to.hash || from.world === to.world) continue;
      const ask = from.sell, bid = to.buy;
      if (!Number.isFinite(ask) || !Number.isFinite(bid) || bid <= ask) continue;

      const sizeAtPrice = Math.min(
        Number.isFinite(from.sellTopAmount) ? from.sellTopAmount : Infinity,
        Number.isFinite(to.buyTopAmount) ? to.buyTopAmount : Infinity
      );
      const coins = Number.isFinite(sizeAtPrice) ? Math.min(sizeAtPrice, OFFER_MAX) : null;

      const grossPerCoin = bid - ask;
      let netTotal = null, netPerCoin = null, fees = null;
      if (coins) {
        const buyTotal = ask * coins, sellTotal = bid * coins;
        fees = fee(buyTotal) + fee(sellTotal);
        netTotal = sellTotal - buyTotal - fees;
        netPerCoin = netTotal / coins;
      }
      out.push({
        from: from.world, to: to.world,
        fromAt: from.capturedAt, toAt: to.capturedAt,
        ask, bid, grossPerCoin,
        returnPct: (grossPerCoin / ask) * 100,
        coins, fees, netTotal, netPerCoin,
        sizeKnown: Number.isFinite(sizeAtPrice)
      });
    }
  }
  return out.sort((a, b) =>
    (b.netTotal ?? b.grossPerCoin * 1e3) - (a.netTotal ?? a.grossPerCoin * 1e3));
}
