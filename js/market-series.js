/*
 * Chart-ready series for the Markets page. Pure functions over server days
 * ('YYYY-MM-DD', opening at the 10:00 Berlin save); no DOM and no chart library.
 *
 * A line only ever joins two real observations. Consecutive server days are
 * joined by a solid segment; observations with unobserved days between them
 * are joined by a dotted segment, so the interval reads as not observed.
 * Nothing is added inside a gap.
 */
import { addDays, bestOfferCloses, marketDailyStatistics } from './market-history.js';

// One shared canonical dataset for lines, histogram, legend and image exports.
export function marketValues(file) {
  const closes = bestOfferCloses(file.observations);
  const daily = marketDailyStatistics(file);
  return { closes, closeDays: closes.map(c => c.serverDay), daily,
    dailyByDay: new Map(daily.map(d => [d.serverDay, d])) };
}
export const statisticsAt = (view, day, side) => view.dailyByDay.get(day)?.[side];

// Lightweight Charts colours the segment from a point to the next one with
// that point's colour (checked against 5.2.1); this colour is never drawn.
export const HIDDEN = 'rgba(0,0,0,0)';

const dayNumber = day => Date.parse(`${day}T00:00:00Z`) / 86400000;
export const daysBetween = (from, to) => dayNumber(to) - dayNumber(from);

// Every server day from first to last inclusive, so time on the axis is
// proportional and a gap takes the room its missing days would.
export function dayGrid(first, last) {
  const days = [];
  for (let day = first; day <= last; day = addDays(day, 1)) days.push(day);
  return days;
}

/*
 * points: [{time, value}] in day order, one per server day. Returns two layers
 * over the same real points: `solid` draws only day-to-next-day segments,
 * `dotted` draws only segments that span unobserved days.
 */
export function lineLayers(points) {
  const solid = [], dotted = [];
  points.forEach((point, i) => {
    const next = points[i + 1];
    const consecutive = next !== undefined && daysBetween(point.time, next.time) === 1;
    const spansGap = next !== undefined && !consecutive;
    solid.push(consecutive ? { ...point } : { ...point, color: HIDDEN });
    dotted.push(spansGap ? { ...point } : { ...point, color: HIDDEN });
  });
  return { solid, dotted };
}

/*
 * Where `day` falls among sorted observed days: its own index when observed,
 * otherwise -1, plus the nearest observed days before and after (-1 if none).
 * The legend uses it to name the observation a change is measured from and the
 * observations that bound an unobserved stretch.
 */
export function neighbours(days, day) {
  let lo = 0, hi = days.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (days[mid] < day) lo = mid + 1; else hi = mid; }
  const at = days[lo] === day ? lo : -1;
  return { at, before: lo - 1, after: at === -1 ? (lo < days.length ? lo : -1) : (lo + 1 < days.length ? lo + 1 : -1) };
}

export const RANGES = ['1M', '3M', '6M', 'YTD', '1Y', 'All'];
const MONTHS = { '1M': 1, '3M': 3, '6M': 6, '1Y': 12 };

// The first day a range shows when it ends on `end`; null for All. Months are
// calendar months, clamped to the shorter month (31 March - 1M = 28/29 Feb).
export function rangeStart(end, range) {
  if (range === 'All') return null;
  const [y, m, d] = end.split('-').map(Number);
  if (range === 'YTD') return `${y}-01-01`;
  if (!MONTHS[range]) throw new Error(`Unknown range ${range}`);
  const month = new Date(Date.UTC(y, m - 1 - MONTHS[range], 1));
  const last = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0)).getUTCDate();
  month.setUTCDate(Math.min(d, last));
  return month.toISOString().slice(0, 10);
}

/*
 * Change of the latest observed value against a base: the latest observation
 * on or before the range start, or the first inside the range when the world
 * had none before it. closes: [{day, value}] in day order. Null when there is
 * no earlier observation to compare with.
 */
export function changeOver(closes, start) {
  if (closes.length < 2) return null;
  const last = closes.at(-1);
  let base = closes[0];
  if (start) {
    const before = closes.findLast(c => c.day <= start);
    base = before ?? closes.find(c => c.day >= start);
  }
  if (!base || base.day === last.day) return null;
  return { from: base, to: last, ratio: last.value / base.value - 1 };
}
