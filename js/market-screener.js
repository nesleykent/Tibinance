/*
 * Markets Screener: every world's market side by side, for one side and one range. Pure functions over the history
 * index (data/market-history/<asset>/index.json) and its overview (overview.json); no DOM, no chart library.
 *
 * A row holds, for the selected side unless named otherwise:
 *   last, lastDay     the latest best offer and its server day
 *   sell, buy, spread both latest best offers and their difference (Sell less Buy), whichever side is selected
 *   delta, ratio      change of the latest best offer over the range, by the watchlist's rule (changeOver)
 *   txPerDay, txDays  the mean raw Number of Transactions per completed server day with a daily figure in the range,
 *                     and how many such days there were; never a traded TC quantity
 *   depth, depthDay   the latest Captured Depth: Tibia Coins across every visible offer of the last screenshot that
 *                     carried it, not traded volume
 *   points            the observed closes the mini chart draws (see miniChart); observedInRange, whether any is inside
 * Nothing is interpolated: a value that was not observed is null, and the mini chart joins only real observations.
 */
import { addDays } from './market-history.js';
import { changeOver, daysBetween, rangeStart } from './market-series.js';

export const STALE_DAYS = 7;   // a current world whose latest best offer is older than this is marked, as in the watchlist

// Tibia's own order of PvP types; a type not listed here follows them alphabetically.
const PVP_ORDER = ['Optional PvP', 'Open PvP', 'Retro Open PvP', 'Hardcore PvP', 'Retro Hardcore PvP'];

export const SORTS = {
  world: 'World',
  last: 'Last',
  ratio: 'Change %',
  delta: 'Change',
  spread: 'Spread',
  txPerDay: 'Transactions per day',
  depth: 'Captured Depth'
};

export const STATUSES = { active: 'Active', retired: 'Retired', all: 'All' };
export const DATA = { all: 'Any', observed: 'With best offers', current: `Observed in the last ${STALE_DAYS} days` };

const retired = w => w.status === 'retired';
// A world's ranges end with the dataset, or on a retired world's last observed day (js/markets.js endOf).
export const endOf = (w, through) => retired(w)
  ? [w.bestOfferDays.last, w.dailyStatisticsDays.last].filter(Boolean).sort().at(-1) ?? through : through;

/*
 * The mean daily transactions of one side over [from, to] (inclusive server days; from null means the series start),
 * from the overview's day arrays. Days without a figure are left out, never counted as zero.
 */
export function transactionsOver(series, side, from, to) {
  if (!series) return { perDay: null, days: 0, total: null };
  const values = series[side], first = series.first;
  const start = from ? Math.max(0, daysBetween(first, from)) : 0, end = Math.min(values.length - 1, daysBetween(first, to));
  let total = 0, days = 0, lo = -1, hi = -1;
  for (let i = start; i <= end; i++) if (values[i] !== null) { total += values[i]; days++; if (lo === -1) lo = i; hi = i; }
  // first and last: the days with a figure that bound the mean.
  return days ? { perDay: total / days, days, total, first: addDays(first, lo), last: addDays(first, hi) } : { perDay: null, days: 0, total: null };
}

export function screenerRows(index, overview, { side, range }) {
  const extra = new Map((overview?.worlds ?? []).map(w => [w.world, w]));
  const i = side === 'sell' ? 1 : 2;
  return index.worlds.map(w => {
    const end = endOf(w, index.through), start = rangeStart(end, range);
    const closes = w.bestOfferCloses.map(c => ({ day: c[0], value: c[i] }));
    const change = changeOver(closes, start);
    const latest = w.bestOfferCloses.at(-1), o = extra.get(w.world);
    const tx = transactionsOver(o?.transactions, side, start, end);
    const depth = o?.depth?.[side] ?? null;
    return {
      world: w.world, status: w.status, type: w.type ?? null, battleye: w.battleye ?? null, location: w.location ?? null,
      offline: w.offline ?? null, mergedInto: w.mergedInto ?? null,
      last: latest ? latest[i] : null, lastDay: latest?.[0] ?? null,
      sell: latest?.[1] ?? null, buy: latest?.[2] ?? null, spread: latest ? latest[1] - latest[2] : null,
      delta: change ? change.to.value - change.from.value : null, ratio: change?.ratio ?? null, change,
      txPerDay: tx.perDay, txDays: tx.days, txFirst: tx.first ?? null, txLast: tx.last ?? null,
      depth, depthDay: depth === null ? null : o.depth.serverDay,
      stale: !retired(w) && (!latest || daysBetween(latest[0], index.through) > STALE_DAYS),
      start, end, points: closesInView(closes, start),
      // A world can have a latest best offer and none inside the range: its mini chart would be empty.
      observedInRange: closes.some(c => (!start || c.day >= start) && c.day <= end)
    };
  });
}

// The closes in a range, led by the last one on or before its first day when there is one (the value the change is
// measured from, changeOver's base): the line enters from the edge, as on the chart.
function closesInView(closes, start) {
  if (!start) return closes;
  return closes.slice(Math.max(0, closes.findLastIndex(c => c.day <= start)));
}

const has = (value, wanted) => !wanted || value === wanted;
/*
 * filters: { query, status ('active' | 'retired' | 'all'), type, battleye, location, data ('all' | 'observed' |
 * 'current') }; an empty value matches everything.
 */
export function filterRows(rows, { query = '', status = 'active', type = '', battleye = '', location = '', data = 'all' } = {}) {
  const needle = query.trim().toLowerCase();
  return rows.filter(r => (!needle || r.world.toLowerCase().includes(needle))
    && (status === 'all' || r.status === status)
    && has(r.type, type) && has(r.battleye, battleye) && has(r.location, location)
    && (data === 'all' || (data === 'observed' ? r.last !== null : r.last !== null && !r.stale && r.status === 'active')));
}

// By one key and direction (1 ascending, -1 descending); worlds without the value go last either way, then by name.
export function sortRows(rows, key, dir) {
  return [...rows].sort((a, b) => {
    if (key === 'world') return dir * a.world.localeCompare(b.world);
    if (a[key] === null || b[key] === null) return (a[key] === null) - (b[key] === null) || a.world.localeCompare(b.world);
    return dir * (a[key] - b[key]) || a.world.localeCompare(b.world);
  });
}

// The values a filter can take among some rows, in a reading order: PvP types in Tibia's order, the rest by name.
export function options(rows, key) {
  const values = [...new Set(rows.map(r => r[key]).filter(Boolean))];
  if (key !== 'type') return values.sort((a, b) => a.localeCompare(b));
  const rank = v => PVP_ORDER.includes(v) ? PVP_ORDER.indexOf(v) : PVP_ORDER.length;
  return values.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

/*
 * A mini chart's geometry in a width x height box, inset by `pad` so the latest point's mark is whole: x is proportional
 * to server days from `from` to `to`, so a gap takes the room its days would; y spans the drawn values, highest at the top. Like the chart, consecutive
 * server days are joined by a solid segment and observations across unobserved days by a dotted one; nothing is
 * added between them. A point before `from` (the range's base) lies left of the box and is clipped by the drawing.
 * Returns { solid, dotted } SVG path data, `base` (the y of the first value, the one a change is measured from),
 * `last` ({x, y} of the latest point) and `area` (the region under the line, for a faint fill); null without points.
 */
export function miniChart(points, { from, to, width, height, pad = 4 }) {
  if (!points.length) return null;
  const first = from ?? points[0].day, span = Math.max(1, daysBetween(first, to));
  const values = points.map(p => p.value), low = Math.min(...values), high = Math.max(...values);
  const x = day => round(pad + daysBetween(first, day) / span * (width - pad * 2));
  const y = value => round(high === low ? height / 2 : pad + (high - value) / (high - low) * (height - pad * 2));
  const xy = points.map(p => [x(p.day), y(p.value)]);
  let solid = '', dotted = '';
  for (let k = 1; k < points.length; k++) {
    const segment = `M${xy[k - 1][0]} ${xy[k - 1][1]}L${xy[k][0]} ${xy[k][1]}`;
    if (daysBetween(points[k - 1].day, points[k].day) === 1) solid += segment; else dotted += segment;
  }
  const line = xy.map(([px, py], k) => `${k ? 'L' : 'M'}${px} ${py}`).join('');
  const area = xy.length > 1 ? `${line}L${xy.at(-1)[0]} ${height}L${xy[0][0]} ${height}Z` : '';
  return { solid: merge(solid), dotted: merge(dotted), area, base: xy[0][1], last: { x: xy.at(-1)[0], y: xy.at(-1)[1] } };
}
const round = n => Math.round(n * 10) / 10;
// Consecutive segments sharing an end become one polyline, so a long run of days is one path, not hundreds.
const merge = path => path.replace(/L(-?[\d.]+) (-?[\d.]+)M\1 \2(?=L)/g, 'L$1 $2');
