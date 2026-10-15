/*
 * Market history: TibiaMarket.top snapshots and Tibinance captures converted to
 * one record vocabulary (Tibinance field names) for the Markets page. Pure
 * functions only; tools/build_market_history.mjs does the reading and writing.
 *
 * Three record types are kept apart, never substituted for one another:
 *   observations             point-in-time offers and rolling 30-day Statistics
 *   dailyStatistics          observed completed server-day Statistics, per side
 *   estimatedDailyStatistics capture-to-capture estimates derived from rolling Statistics
 *
 * Nothing is interpolated. A field absent from an observed record was not observed.
 */
import { STATISTICS_FIELDS, statisticsIssues, validatedStatistics } from './statistics.js';

// Every asset the history can describe. Only Tibia Coin is built today. The
// Statistics retains raw activity counters; actual traded TC quantity is unknown.
export const ASSETS = {
  'tibia-coin': { id: 'tibia-coin', name: 'Tibia Coin', tibiaMarketItemId: 22118 }
};

// Every best-offer pair, from any source: both prices are positive whole gold
// amounts and the book is not crossed (a crossed book would already have traded).
export const validBook = (sell, buy) => Number.isSafeInteger(sell) && Number.isSafeInteger(buy) && 0 < buy && buy < sell;

// Screenshot captures only. There an extreme spread usually means OCR misread a
// price, so a best Buy Offer below 80% of the best Sell Offer is set aside (the
// research's floor, reports/tc-cycle/research_data.py MIN_BID_ASK). Structured
// TibiaMarket history keeps wide spreads: on thin worlds they are real.
export const MIN_CAPTURE_BUY_SELL_RATIO = 0.8;
export const plausibleCaptureSpread = (sell, buy) => buy / sell >= MIN_CAPTURE_BUY_SELL_RATIO;

// Server days open at the 10:00 Europe/Berlin server save and are labelled by
// that opening date, as research_data.server_day labels them. Intl resolves
// CET/CEST, so the save is 09:00 UTC in winter and 08:00 UTC in summer.
const berlin = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric',
  month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' });
export function serverDay(instant) {
  const p = Object.fromEntries(berlin.formatToParts(new Date(instant)).map(x => [x.type, x.value]));
  const date = `${p.year}-${p.month}-${p.day}`;
  return Number(p.hour) < 10 ? addDays(date, -1) : date;
}
export const addDays = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

const side = (transactions, highestPrice, averagePrice, lowestPrice) =>
  ({ transactions, highestPrice, averagePrice, lowestPrice });

// One Statistics side under the shared contract; null when its fields are the
// -1 "not collected" sentinel, 'invalid' when present but inconsistent.
function statisticsSide(value) {
  if (Object.values(value).every(v => v === -1)) return null;
  const both = { buy: value, sell: value };
  return statisticsIssues(both).length ? 'invalid' : validatedStatistics(both).sell;
}

/*
 * One TibiaMarket item_history row. Returns the converted observation (best
 * offers and/or 30-day Statistics) and the daily Statistics it reports, with the
 * reason any part was not converted.
 *
 * Daily values are frozen between server saves and change exactly at 10:00
 * Berlin, so a row fetched during server day D reports the completed day D-1;
 * thirty consecutive days sum exactly to month_sold / month_bought.
 */
export function fromTibiaMarket(row) {
  const capturedAtUtc = new Date(Math.round(row.time * 1000)).toISOString();
  const day = serverDay(Date.parse(capturedAtUtc));
  const excluded = [];
  const observation = { capturedAtUtc, serverDay: day, source: 'tibiamarket', sourceTimestamp: row.time };

  if (row.sell_offer === -1 && row.buy_offer === -1) excluded.push('missingBestOffers');
  else if (validBook(row.sell_offer, row.buy_offer)) Object.assign(observation, { sell: row.sell_offer, buy: row.buy_offer });
  else excluded.push('invalidBestOffers');

  const month = {
    sell: statisticsSide(side(row.month_sold, row.month_highest_sell, row.month_average_sell, row.month_lowest_sell)),
    buy: statisticsSide(side(row.month_bought, row.month_highest_buy, row.month_average_buy, row.month_lowest_buy))
  };
  if (!month.sell && !month.buy) excluded.push('missingStatistics30d');
  else if (month.sell && month.buy && month.sell !== 'invalid' && month.buy !== 'invalid') {
    observation.statistics30d = { buy: month.buy, sell: month.sell };
  } else excluded.push('incompleteStatistics30d');

  const daily = { serverDay: addDays(day, -1) };
  const days = {
    sell: statisticsSide(side(row.day_sold, row.day_highest_sell, row.day_average_sell, row.day_lowest_sell)),
    buy: statisticsSide(side(row.day_bought, row.day_highest_buy, row.day_average_buy, row.day_lowest_buy))
  };
  if (!days.sell && !days.buy) excluded.push('missingDailyStatistics');
  for (const name of ['sell', 'buy']) {
    if (days[name] === 'invalid') excluded.push(`invalidDaily${name === 'sell' ? 'Sell' : 'Buy'}`);
    else if (days[name]) daily[name] = days[name];
  }
  return {
    observation: 'sell' in observation || 'statistics30d' in observation ? observation : null,
    daily: 'sell' in daily || 'buy' in daily ? daily : null,
    excluded
  };
}

const OFFER_FIELDS = ['sell', 'sellVolume', 'sellTopAmount', 'goldDemand', 'buy', 'buyVolume', 'buyTopAmount', 'goldSupply'];

// One canonical Tibinance capture (data/observations.json). Individual offer
// rows, hashes and capture context stay in the capture dataset.
export function fromCapture(capture) {
  if (!capture.capturedAtUtc) return { observation: null, excluded: ['unresolvedInstant'] };
  const observation = { capturedAtUtc: capture.capturedAtUtc, serverDay: serverDay(Date.parse(capture.capturedAtUtc)), source: 'screenshot' };
  if (capture.viewType === 'statistics') {
    if (statisticsIssues(capture.statistics30d).length) return { observation: null, excluded: ['invalidStatistics30d'] };
    // The capture's own reference date must be the server day: one day convention.
    if (capture.statisticsReferenceDate !== observation.serverDay) throw new Error(`Reference date differs from server day: ${capture.hash}`);
    observation.statistics30d = validatedStatistics(capture.statistics30d);
    return { observation, excluded: [] };
  }
  if (!validBook(capture.sell, capture.buy)) return { observation: null, excluded: ['invalidBestOffers'] };
  if (!plausibleCaptureSpread(capture.sell, capture.buy)) return { observation: null, excluded: ['implausibleCaptureSpread'] };
  for (const k of OFFER_FIELDS) if (Number.isSafeInteger(capture[k])) observation[k] = capture[k];
  return { observation, excluded: [] };
}

// Daily reports of the same server day must agree; a day reported two different
// ways is dropped rather than resolved by guessing which report is right.
export function mergeDaily(reports) {
  const days = new Map(), conflicts = new Set();
  for (const d of reports) {
    const prior = days.get(d.serverDay);
    if (conflicts.has(d.serverDay)) continue;
    if (!prior) days.set(d.serverDay, d);
    else if (JSON.stringify(prior) !== JSON.stringify(d)) { days.delete(d.serverDay); conflicts.add(d.serverDay); }
  }
  return { daily: [...days.values()].sort((a, b) => a.serverDay.localeCompare(b.serverDay)), conflicts: [...conflicts].sort() };
}

// Select each side independently by acquisition time within its reference day.
// Source never changes the meaning or precedence of a Statistics field. All
// reports stay in dailyStatisticsObservations; this is only a chart projection.
export function latestDailyStatistics(reports) {
  const days = new Map();
  for (const report of [...reports].sort((a, b) => Date.parse(a.capturedAtUtc) - Date.parse(b.capturedAtUtc))) {
    const day = days.get(report.serverDay) ?? { serverDay: report.serverDay, provenance: {} };
    for (const side of ['buy', 'sell']) if (report[side]) {
      const value = validatedStatistics({ buy: report[side], sell: report[side] })[side];
      if (Date.parse(day.provenance[side]?.capturedAtUtc) === Date.parse(report.capturedAtUtc) &&
          STATISTICS_FIELDS.some(field => day[side][field] !== value[field])) {
        throw new Error(`Ambiguous daily ${side} Statistics at ${report.capturedAtUtc} for ${report.serverDay}`);
      }
      day[side] = value;
      day.provenance[side] = { source: report.source, capturedAtUtc: report.capturedAtUtc,
        ...(report.sourceTimestamp !== undefined ? { sourceTimestamp: report.sourceTimestamp } : {}) };
    }
    days.set(report.serverDay, day);
  }
  return [...days.values()].sort((a, b) => a.serverDay.localeCompare(b.serverDay));
}

const ESTIMATE_WINDOW_DAYS = 30;

// Daily values recovered from rolling 30-day Statistics. A rolling reading on server day S covers the completed days
// S-30 to S-1 and only changes at the server save, so any two readings a < b (at most 30 days apart, any clock time) give
//   D(a) + ... + D(b-1) = T(b) - T(a) + D(a-30) + ... + D(b-31)
// and the same for transactions x Average Price (the average is transaction-weighted). Days in a..b-1 with a daily
// report are subtracted; what remains belongs to the days without one.
//   rolling-30d-reconstructed  one day is missing and every day leaving the window is known: exact (99.98% of 5,504
//                              checks equal the reported count, averages within 0.3% at the median)
//   rolling-30d-mean-outflow   otherwise: an unknown leaving day is taken as T(a)/30 at the window average, and the
//                              remainder is shared evenly between the missing days (about 12% off at the median)
// Recovered days count as known for later intervals only when reconstructed. Never a daily observation.
export function estimateDailyStatistics(observations, daily = []) {
  const byDay = new Map();
  for (const observation of observations ?? []) if (observation.statistics30d) byDay.set(observation.serverDay, observation);
  const days = [...byDay.keys()].sort();
  const known = new Map(daily.map(d => [d.serverDay, d])), estimates = new Map();
  const knownSide = (day, name) => known.get(day)?.[name] ?? (estimates.get(day)?.provenance[name]?.method === 'rolling-30d-reconstructed' ? estimates.get(day)[name] : null);
  const exactValue = side => side.transactions === 0 || Number.isSafeInteger(side.averagePrice);
  for (let i = 1; i < days.length; i++) {
    const previous = byDay.get(days[i - 1]), current = byDay.get(days[i]);
    const span = Math.round((Date.parse(`${days[i]}T00:00:00Z`) - Date.parse(`${days[i - 1]}T00:00:00Z`)) / 86400000);
    if (span > ESTIMATE_WINDOW_DAYS) continue;
    const entering = Array.from({ length: span }, (_, k) => addDays(days[i - 1], k));
    for (const name of ['buy', 'sell']) {
      const before = previous.statistics30d[name], after = current.statistics30d[name];
      if (!before || !after) continue;
      const missing = entering.filter(day => !knownSide(day, name));
      if (!missing.length) continue;
      let count = after.transactions - before.transactions, value = after.transactions * after.averagePrice - before.transactions * before.averagePrice;
      let exact = missing.length === 1;
      for (const day of entering) {
        const leaving = knownSide(addDays(day, -ESTIMATE_WINDOW_DAYS), name);
        if (leaving && exactValue(leaving)) { count += leaving.transactions; value += leaving.transactions ? leaving.transactions * leaving.averagePrice : 0; }
        else { exact = false; count += before.transactions / ESTIMATE_WINDOW_DAYS; value += before.transactions / ESTIMATE_WINDOW_DAYS * before.averagePrice; }
        const reported = knownSide(day, name);
        if (reported) {
          if (!exactValue(reported)) exact = false;
          count -= reported.transactions; value -= reported.transactions ? reported.transactions * (reported.averagePrice ?? before.averagePrice) : 0;
        }
      }
      if (!Number.isFinite(count) || count < 0) continue;
      const perDay = count / missing.length, low = Math.min(before.lowestPrice, after.lowestPrice), high = Math.max(before.highestPrice, after.highestPrice);
      const average = count > 0 ? value / count : null;
      for (const day of missing) {
        const side = { transactions: Math.round(perDay) };
        if (side.transactions > 0 && Number.isFinite(average) && average >= low && average <= high) side.averagePrice = Math.round(average);
        const estimate = estimates.get(day) ?? { serverDay: day, provenance: {} };
        estimate[name] = side;
        estimate.provenance[name] = { kind: 'estimated', method: exact ? 'rolling-30d-reconstructed' : 'rolling-30d-mean-outflow',
          windowDays: ESTIMATE_WINDOW_DAYS, previousCapturedAtUtc: previous.capturedAtUtc, capturedAtUtc: current.capturedAtUtc,
          intervalDays: span, ...(missing.length > 1 ? { sharedWithDays: missing.length } : {}) };
        estimates.set(day, estimate);
      }
    }
  }
  return [...estimates.values()].sort((x, y) => x.serverDay.localeCompare(y.serverDay));
}

// Daily acquisition reports are authoritative. Estimates only supplement a
// missing side/day and retain their own provenance so the UI cannot present
// them as measured daily Statistics.
export function mergeDailyStatistics(observed, estimated) {
  const days = new Map();
  for (const source of [estimated, observed]) for (const report of source ?? []) {
    const day = days.get(report.serverDay) ?? { serverDay: report.serverDay, provenance: {} };
    for (const name of ['buy', 'sell']) if (report[name]) {
      day[name] = report[name];
      day.provenance[name] = report.provenance?.[name] ?? {};
    }
    days.set(report.serverDay, day);
  }
  return [...days.values()].sort((a, b) => a.serverDay.localeCompare(b.serverDay));
}

export function marketDailyStatistics(file) {
  const observed = file.dailyStatisticsObservations
    ? latestDailyStatistics(file.dailyStatisticsObservations) : (file.dailyStatistics ?? []);
  const estimated = file.estimatedDailyStatistics ?? estimateDailyStatistics(file.observations, observed);
  return mergeDailyStatistics(observed, estimated);
}

// One point per server day with best offers: the day's last observation and how
// many the day had. Expects observations in time order, as mergeObservations
// returns them, so the days come out in order too.
export function bestOfferCloses(observations) {
  const days = new Map();
  for (const o of observations) {
    if (!('sell' in o)) continue;
    const count = (days.get(o.serverDay)?.observations ?? 0) + 1;
    days.set(o.serverDay, { serverDay: o.serverDay, capturedAtUtc: o.capturedAtUtc, sell: o.sell, buy: o.buy, observations: count });
  }
  return [...days.values()];
}

/*
 * A world's daily transaction counters as two arrays, one entry per server day
 * from `first` to the last reported day, null where that side has no figure, so
 * the Screener can sum any range without the world file. Raw counters, as the
 * daily Statistics report them; never a traded TC quantity.
 */
export function dailyTransactionSeries(daily) {
  if (!daily.length) return null;
  const first = daily[0].serverDay, at = day => Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${first}T00:00:00Z`)) / 86400000);
  const length = at(daily.at(-1).serverDay) + 1, sell = Array(length).fill(null), buy = Array(length).fill(null);
  const estimated = { sell: [], buy: [] };
  for (const d of daily) {
    const index = at(d.serverDay);
    if (d.sell) sell[index] = d.sell.transactions;
    if (d.buy) buy[index] = d.buy.transactions;
    for (const side of ['sell', 'buy']) if (d[side] && d.provenance?.[side]?.kind === 'estimated') estimated[side].push(index);
  }
  return { first, sell, buy, ...(estimated.sell.length || estimated.buy.length ? { estimated } : {}) };
}

// The latest captured offer depth: Tibia Coins across every visible offer on
// each side of the last screenshot that carried it. Offer depth, not traded volume.
export function latestCapturedDepth(observations) {
  const o = observations.findLast(x => 'sellVolume' in x || 'buyVolume' in x);
  if (!o) return null;
  return { capturedAtUtc: o.capturedAtUtc, serverDay: o.serverDay,
    ...('sellVolume' in o ? { sell: o.sellVolume } : {}), ...('buyVolume' in o ? { buy: o.buyVolume } : {}) };
}

// Sources observe the same fields independently, including at the same instant.
// Refuse duplicate source/instant records, but preserve cross-source observations.
export function mergeObservations(observations) {
  const sorted = [...observations].sort((a, b) => a.capturedAtUtc.localeCompare(b.capturedAtUtc) || (a.source ?? '').localeCompare(b.source ?? ''));
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].capturedAtUtc === sorted[i - 1].capturedAtUtc && sorted[i].source === sorted[i - 1].source) throw new Error(`Two observations at ${sorted[i].capturedAtUtc} from ${sorted[i].source ?? 'unknown source'}`);
  }
  return sorted;
}
