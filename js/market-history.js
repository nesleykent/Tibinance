/*
 * Market history: TibiaMarket.top snapshots and Tibinance captures converted to
 * one record vocabulary (Tibinance field names) for the Markets page. Pure
 * functions only; tools/build_market_history.mjs does the reading and writing.
 *
 * Two different measures are kept apart, never substituted for one another:
 *   observations     point-in-time best Sell/Buy Offer prices (and, when the
 *                    snapshot carried them, rolling 30-day Statistics)
 *   dailyStatistics  completed server days of executed transactions, per side
 *
 * Nothing is interpolated. A field absent from a record was not observed.
 */
import { statisticsIssues, validatedStatistics } from './statistics.js';

// Every asset the history can describe. Only Tibia Coin is built today. The
// Statistics contract counts Tibia Coin transactions in 25-TC lots.
export const ASSETS = {
  'tibia-coin': { id: 'tibia-coin', name: 'Tibia Coin', tibiaMarketItemId: 22118, lotSize: 25 }
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
  const observation = { capturedAtUtc, serverDay: day };

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
  const observation = { capturedAtUtc: capture.capturedAtUtc, serverDay: serverDay(Date.parse(capture.capturedAtUtc)) };
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

// Every observation is a distinct instant; two records of one world at the same
// instant would be ambiguous, so the build refuses them.
export function mergeObservations(observations) {
  const sorted = [...observations].sort((a, b) => a.capturedAtUtc.localeCompare(b.capturedAtUtc));
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].capturedAtUtc === sorted[i - 1].capturedAtUtc) throw new Error(`Two observations at ${sorted[i].capturedAtUtc}`);
  }
  return sorted;
}
